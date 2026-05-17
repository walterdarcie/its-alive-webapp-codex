# Busca de shows — it's alive

> Como a busca por shows funciona e como trabalhar com a API do setlist.fm no projeto.

## Visão geral

A busca aceita texto livre (`metallica chicago 2024`), separadores explícitos (`iron maiden, são paulo, brasil, 2022`) e preposições (`foo fighters em são paulo`). O parser converte a query em filtros estruturados, identifica o artista pelo MBID quando possível, e tenta uma sequência curta de planos contra a API do setlist.fm. Paralelamente, busca shows futuros no Ticketmaster e mescla os resultados.

Pontos de entrada:

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| UI | `app/ui/search-page-client.tsx` | Input, debounce de 420ms, ranking visual, paginação por scroll |
| Route handler | `app/api/setlists/search/route.ts` | Validação, cache (6h), chamadas paralelas, merge de resultados |
| Cliente Setlist.fm | `lib/setlist-api.ts` | Parsing, resolução de MBID, plano de queries, fallbacks |
| Cliente Ticketmaster | `lib/ticketmaster-api.ts` | Shows futuros, cache 1h |
| Cache | `lib/setlist-cache.ts` | LRU in-memory (TTL 6h busca / 24h artistas / 30min negativo / 1h Ticketmaster) |

## Ticketmaster Discovery API v2

**Propósito:** única fonte de shows futuros. O setlist.fm não tem endpoint de upcoming shows.

**Rate limit:** 5.000 req/dia no plano gratuito. Erros são silenciosos (retornam `[]`).

**Endpoint usado:** `GET /discovery/v2/events.json`

**Parâmetros enviados:**

| Parâmetro | Valor |
|---|---|
| `apikey` | `TICKETMASTER_API_KEY` |
| `keyword` | Nome do artista (extraído por `extractArtistForUpcoming`) |
| `classificationName` | `music` |
| `sort` | `date,asc` |
| `size` | `20` |
| `startDateTime` | Timestamp atual em UTC (ISO 8601) |

**Mapeamento para `ShowRecord`:**

| Campo TM | Campo ShowRecord | Observação |
|---|---|---|
| `id` | `id` | Prefixado com `tm-` |
| `attractions[0].name` | `artist` | Fallback: nome do artista da query |
| `venues[0].name` | `venue` | |
| `venues[0].city.name + state.stateCode` | `city` | Concatenados com `, ` |
| `venues[0].country.name` | `country` | |
| `dates.start.localDate` | `eventDateIso` | Formato `YYYY-MM-DD` |
| `url` | `ticketUrl` | Só quando `dates.status.code === "onsale"` |
| `name` (se diferente do artista) | `tourName` | |

**Extração do artista para busca no Ticketmaster:**

A função `extractArtistForUpcoming(searchTerm)` determina qual nome enviar como `keyword`:

1. Se a query tem artista explícito (`foo fighters, são paulo`) → retorna o artista explícito
2. Se há correspondência no mapa `KNOWN_ARTIST_MBIDS` (ex: `"metallica"` → `"Metallica"`) → retorna o nome canônico
3. Se a query livre tem ≤ 3 palavras → retorna o `coreText` completo
4. Caso contrário (query longa e ambígua) → retorna `""` e a chamada é pulada

**Interação com o filtro de ano (`year`):**

O Ticketmaster só lista shows futuros (`startDateTime = agora`). Para não poluir o ranking quando o usuário pede um ano específico, o route handler em `app/api/setlists/search/route.ts` aplica duas regras antes do merge:

1. `extractYearFromSearchTerm(searchTerm)` devolve o ano da query (vazio quando não houver).
2. Se o ano pedido for **anterior ao ano atual**, a chamada ao Ticketmaster é pulada (`shouldFetchUpcoming = false`). Sem isso, o merge incluiria shows futuros (ex.: 2026) numa busca por `metallica 2010`, e o `rankSearchResults` jogaria os futuros para o topo, fazendo o filtro de ano sumir na prática.
3. Se o ano pedido for o atual ou futuro, a chamada acontece e os resultados são filtrados por `eventDateIso.startsWith(year)` antes do merge.

**Cobertura:** Ticketmaster cobre Live Nation, TicketWeb, Universe, FrontGate, MoshTix e outras bilheterias parceiras — a mesma infraestrutura da Live Nation (fusão em 2010).

---

## API do setlist.fm — o que importa

**Rate limit do plano contratado:** `2 req/s` e `1440 req/dia` (compartilhado entre todos os usuários do app). Estourar = `429`. Documentação oficial: <https://api.setlist.fm/docs/1.0/index.html>.

**Endpoints usados:**

| Endpoint | Quando | Cache do projeto |
|---|---|---|
| `GET /search/setlists` | Busca principal — aceita `artistName`, `artistMbid`, `cityName`, `venueName`, `tourName`, `year`, `countryCode` | 6h |
| `GET /search/artists` | Resolução de MBID quando o nome não é canônico | 24h (positivo) / 30min (404) |
| `GET /search/venues` | Fallback de upcoming shows (página HTML do venue) | 24h |
| `GET /setlist/{id}` | Detalhe de um setlist | 24h ou 5min |

**Quirks importantes:**

- `artistName` faz **match de substring**, não fuzzy. `?artistName=metallica` casa "Metallica" e "Black Metallica" e tribute bands. Query inexistente retorna `404` (tratado como zero resultados).
- O mesmo nome de artista pode ter **múltiplos MBIDs**. Exemplo real: "Iron Maiden" retorna 3 entradas — uma delas (`7c3762a3-...`) tem só 1 setlist legado de 1970 em Basildon e contamina buscas. Use sempre o MBID canônico quando souber.
- `cityName` casa com ou sem diacríticos: `sao paulo` e `são paulo` retornam o mesmo resultado.
- Festivais como Lollapalooza **não existem como venue** no setlist.fm: cada edição é registrada no venue físico (Grant Park, Autódromo de Interlagos etc.). `?venueName=Lollapalooza` retorna 404.
- `year` filtra por ano calendário. Combinado com `cityName`, faz AND restrito.

## Pipeline de busca

```
parseStructuredQuery(searchTerm)
  ├─ extrai vírgulas/pipes        → explicitArtist + explicitCity + year + countryCode
  ├─ extrai " em / in / @ "        → mesmo
  ├─ extrai "<artista entre aspas>" → mesmo
  └─ free-form                     → coreText + year + countryCode

  ↓

if explicitArtist:
  runExplicitArtistFlow(parsed)
    1. artistName + cityName + year + countryCode
    2. artistName + cityName (sem year/country)
    3. artistName puro (apenas se nenhum filtro)
    4. resolveArtistCandidatesFromCore → para cada MBID candidato:
         artistMbid + cityName + year + countryCode
    5. (top candidato) artistMbid + cityName (sem year/country)
    6. (top, se sem filtros) artistMbid puro
    7. searchUpcomingShowsByVenueFallback (HTML scraping)
  → se zero: cai para runFreeFormFlow com a query completa
else:
  runFreeFormFlow(parsed)
    1. findKnownArtistFromPrefix → atalho via KNOWN_ARTIST_MBIDS
         a. artistMbid + cityName + year + countryCode (se há remaining)
         b. artistMbid + venueName + year + countryCode (se há remaining)
    2. direct hit: artistName=coreText + year + countryCode
    3. resolveArtistCandidatesFromCore → para cada candidato:
         se `remaining` for sufixo parcial do nome do artista → ignora como localidade
         artistMbid + cityName=effectiveRemaining + year + countryCode
    4. (top candidato + effectiveRemaining) venueName, tourName, upcoming HTML
    5. (sem candidato algum) venueName=coreText e cityName=coreText
```

A função `tryPlansUntilHit` retorna no primeiro plano que devolve `shows.length > 0` ou `total > 0`. Buscas em página `> 1` pulam toda resolução por MBID — apenas o plano principal é tentado, para evitar duplicar chamadas durante scroll infinito.

## Sintaxes aceitas

| Input | Interpretação |
|---|---|
| `metallica` | `artistMbid` canônico (KNOWN map) ou `artistName=metallica` |
| `iron maiden curitiba` | MBID canônico + `cityName=curitiba` |
| `metallica chicago 2024` | MBID canônico + `cityName=chicago` + `year=2024` |
| `iron maiden brasil` | MBID + `countryCode=BR` |
| `foo fighters em são paulo` | `explicitArtist=foo fighters` + `explicitCity=são paulo` |
| `the rolling stones in london 2022` | `explicitArtist=the rolling stones` + `explicitCity=london` + `year=2022` |
| `"guns n' roses" são paulo 2022` | Aspas forçam o artista exato |
| `iron maiden, são paulo, brasil, 2022` | Vírgulas separam artista / cidade / país / ano (qualquer ordem após o primeiro) |
| `metallica \| chicago \| usa` | Pipes funcionam como vírgulas |
| `acdc` / `ac dc` / `gnr` | Aliases reescritos para AC/DC, Guns N' Roses |
| `Tame imp` (digitando "Tame Impala") | Detecta prefixo parcial do nome → busca sem cidade, não falha |

## Resolução de MBID canônico — tabela `known_artists`

O map `KNOWN_ARTIST_MBIDS` (hardcoded em `lib/setlist-api.ts`) foi complementado por uma tabela Supabase populada com o dump do MusicBrainz. A lógica é:

1. `findKnownArtistFromPrefixWithDb(coreText)` — tenta o map hardcoded (22 artistas de alta prioridade, sem rede), depois consulta o Supabase.
2. `lookupArtistInDb(coreText)` — monta todos os prefixos possíveis do texto e faz um único `SELECT … WHERE name_normalized IN (…)` com índice B-tree (`text_pattern_ops`). Resultado cacheado 24h em memória.

A tabela existe para:

1. **Eliminar ambiguidade** — `?artistMbid=...` retorna só o artista canônico; `?artistName=ac/dc` inclui tribute bands.
2. **Reduzir chamadas à API do setlist.fm** — pula o endpoint `/search/artists` quando o artista está na tabela.
3. **Escala** — centenas de milhares de artistas sem custo de bundle nem memória em excesso.

**Schema:** `supabase/migrations/20260515000000_known_artists.sql`

| Coluna | Tipo | Descrição |
|---|---|---|
| `mbid` | TEXT PK | MusicBrainz ID |
| `canonical_name` | TEXT | Nome oficial do artista |
| `name_normalized` | TEXT | lowercase, sem diacríticos, sem apóstrofos |

**Normalização de `name_normalized`:**
```
normalizeLoose(name).replace(/['''`"]/g, "")
```
Mesma função usada pelo parser em `findKnownArtistFromPrefix`.

**Como adicionar um artista individualmente:**

1. Buscar o MBID em <https://musicbrainz.org/>.
2. Confirmar que retorna setlists: `https://api.setlist.fm/rest/1.0/search/setlists?artistMbid={mbid}`.
3. Se for um artista de alta prioridade / desambiguação conhecida, adicionar ao map hardcoded `KNOWN_ARTIST_MBIDS` em `lib/setlist-api.ts`.
4. Para artistas comuns, basta inserir na tabela (a importação do MusicBrainz já cobre a maioria).

**Como popular a tabela com o dump do MusicBrainz (~3 M artistas):**

```bash
# 1. Baixar o dump (≈ 1,6 GB — veja a data mais recente em
#    https://data.metabrainz.org/pub/musicbrainz/data/json-dumps/)
curl -L -o /tmp/mb-artist.tar.xz \
  "https://data.metabrainz.org/pub/musicbrainz/data/json-dumps/20260513-001002/artist.tar.xz"

# 2. Extrair o arquivo NDJSON interno (mbdump/artist)
tar -xJf /tmp/mb-artist.tar.xz -C /tmp mbdump/artist

# 3. Configurar env vars
export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# 4. Rodar o script (≈ 20–40 min)
npx tsx scripts/import-musicbrainz-artists.ts /tmp/mbdump/artist
```

O script é idempotente (`ON CONFLICT DO NOTHING`) e pode ser re-executado.

## Cache

| Camada | Onde | TTL | Chave |
|---|---|---|---|
| Cache do route handler | `lib/setlist-cache.ts` | 6h | `search:{lower}:{page}` |
| Cache de `/search/artists` | mesmo cache | 24h (hit) / 30min (404) | `artists:{lower}` |
| Cache Ticketmaster upcoming | mesmo cache | 1h | `tm:upcoming:{lower}` |
| `Next.js fetch revalidate` | `lib/setlist-api.ts` | 6h busca / 24h artistas | URL completa |
| `Next.js fetch revalidate` | `lib/ticketmaster-api.ts` | 1h | URL completa |
| Cache HTTP do navegador | header `Cache-Control` | 1min cliente / 6h CDN | URL completa |

O cache é LRU com limite de 600 entradas (`MAX_CACHE_ENTRIES` em `setlist-cache.ts`). Reinicio do dev server limpa o cache em memória.

## Testes

### Unitários (`tests/unit/setlist-api.test.ts`)

| Bloco | O que valida |
|---|---|
| `parseStructuredQuery` | Reconhecimento de separadores, ano, país, aliases, blank input |
| `applyArtistAliases` | Reescrita correta de aliases |
| `countryNameToCode` | Mapeamento de nomes + opt-in para códigos de 2 letras |
| `extractTrailingCountry` | Detecção de país no final da string |
| `scoreArtistAgainstPrefix` | Scoring do MBID match |
| `extractArtistForUpcoming` | Extração do artista para Ticketmaster em todos os formatos de query, incluindo nome canônico via janela quando o artista está no meio/fim |
| `extractYearFromSearchTerm` | Extração do filtro de ano (free-form, vírgula, "in/em", vazio) |
| `searchSetlists` (com fetch mock) | Pipeline end-to-end: direct hit, MBID shortcut, resolução, fallbacks, forward do `year` no plano |

Cobertura unitária em `tests/unit/ticketmaster-api.test.ts`:

| Bloco | O que valida |
|---|---|
| `searchUpcomingByArtist` | Retorno vazio sem API key, mapeamento de evento para ShowRecord, prefixo `tm-`, `ticketUrl` apenas para `onsale`, eventos com status diferente, input muito curto |

Rodando localmente:

```bash
npm run test:unit
```

Os testes mockam `globalThis.fetch` — **não fazem chamadas reais à API**. CI roda automaticamente em todo push/PR via `.github/workflows/release-quality.yml`.

### Suite de busca contra API real (`tests/e2e/search-cases.spec.ts`)

Validação a cada deploy de que a busca real (setlist.fm + Ticketmaster + Supabase `known_artists`) atende todas as combinações de ordem dos termos. Cobertura:

- **Nome simples** — `Metallica`
- **Nome composto completo e parcial** — `Tame Impala`, `Tame Imp`
- **Nome + ano em qualquer ordem** — `Metallica 2010`, `2010 Metallica`, `Tame Impala 2010`, `2010 Tame Imp`
- **Nome + cidade em qualquer ordem** — `Metallica São Paulo`, `São Paulo Metallica`, `Tame Impala Bogotá`, `Bogotá Tame Imp`
- **Nome + ano + cidade em qualquer ordem** — `Metallica 2010 São Paulo`, `São Paulo 2010 Metallica`, `2010 Metallica São Paulo`, `Tame Impala Bogotá 2016`, `2016 Bogotá Tame Imp`

Cada caso assert `shows.length > 0`. Cinco casos sem filtro de ano no passado (`Metallica`, `Tame Impala`, `Tame Imp`, `Tame Impala Bogotá`, `Bogotá Tame Imp` — e os equivalentes com cidade) também assertam pelo menos um show com `id` iniciado por `tm-`, validando a integração do Ticketmaster Discovery API.

> `Tame Impala Bogotá 2010` ficou de fora porque o setlist.fm não tem dado para essa combinação (Tame Impala em Bogotá só consta para 2016). Os cases com 2016 cobrem o mesmo cenário sem depender de dado inexistente.

**Habilitação:** a suite só roda quando `LIVE_SEARCH_TESTS=1` (e API keys reais disponíveis). Sem essa variável, todos os testes de `search-cases.spec.ts` são `test.skip()` — isso permite que `npm run test:e2e` (PR / desenvolvimento local) continue rápido e determinístico.

**Rodando localmente** (precisa de `.env.local` com `SETLISTFM_API_KEY`, `TICKETMASTER_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`):

```bash
npm run test:search
```

**CI:** o job `search-live` em `.github/workflows/release-quality.yml` roda essa suite a cada push em `main` (e via `workflow_dispatch`), nunca em PR. Requer os mesmos secrets configurados em `Settings → Secrets and variables → Actions`. Se algum secret estiver faltando, o job falha em vez de silenciar — isso é proposital, para que regressões em provisão de credenciais sejam visíveis.

## Troubleshooting

### Resultado errado para query "X" (ex.: Basildon 1970 quando esperava Iron Maiden em SP)

Sintoma de **MBID duplicado**. Cheque com `curl`:

```bash
curl -H "x-api-key: $SETLISTFM_API_KEY" \
  "https://api.setlist.fm/rest/1.0/search/artists?artistName=iron%20maiden"
```

Se houver mais de uma entrada com o mesmo `name`, identifique a canônica via `https://www.setlist.fm/setlists/{slug}` (a página com mais setlists) e adicione ao `KNOWN_ARTIST_MBIDS`.

### Zero resultados para query que deveria existir

1. Confirme o show com `curl` direto na API.
2. Verifique se a cidade/venue está cadastrada como você está digitando — festivais (Lollapalooza, Rock in Rio) muitas vezes não existem como `venue` separado.
3. Veja `dev.log` ou `vercel logs` para conferir qual plano foi tentado.

### 429 — Busca temporariamente limitada

Estourou `2 req/s` ou `1440/dia`. Em produção, a UI já usa debounce de 420ms; o problema só aparece em testes batch. Espere 30–60s e tente novamente. Para investigar consumo, conte chamadas no `dev.log`.

### Adicionar nova preposição de cidade (ex.: "no" português)

Edite o regex em `parseStructuredQuery`:

```ts
const keywordSplit = /\s(?:em|in|@)\s/i.exec(normalized);
//                            ↑ adicionar aqui
```

Adicione teste em `tests/unit/setlist-api.test.ts` cobrindo o novo separador.
