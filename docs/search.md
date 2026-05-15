# Busca de shows — it's alive

> Como a busca por shows funciona e como trabalhar com a API do setlist.fm no projeto.

## Visão geral

A busca aceita texto livre (`metallica chicago 2024`), separadores explícitos (`iron maiden, são paulo, brasil, 2022`) e preposições (`foo fighters em são paulo`). O parser converte a query em filtros estruturados, identifica o artista pelo MBID quando possível, e tenta uma sequência curta de planos contra a API do setlist.fm.

Pontos de entrada:

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| UI | `app/ui/search-page-client.tsx` | Input, debounce de 420ms, ranking visual, paginação por scroll |
| Route handler | `app/api/setlists/search/route.ts` | Validação, cache (6h), tratamento de 429/erros |
| Cliente da API | `lib/setlist-api.ts` | Parsing, resolução de MBID, plano de queries, fallbacks |
| Cache | `lib/setlist-cache.ts` | LRU in-memory (TTL 6h busca / 24h artistas / 30min negativo) |

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
         artistMbid + cityName=remaining + year + countryCode
    4. (top candidato + remaining) venueName, tourName, upcoming HTML
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

## MBIDs canônicos hardcoded

Lista em `KNOWN_ARTIST_MBIDS` no topo de `lib/setlist-api.ts`. Existe para:

1. **Eliminar ambiguidade** quando o setlist.fm tem múltiplas entradas com o mesmo nome (Iron Maiden, AC/DC etc.).
2. **Reduzir custo** — pula a chamada a `/search/artists` quando o artista está mapeado.
3. **Eliminar tribute bands** no resultado: `?artistMbid=...` retorna só a banda canônica; `?artistName=ac/dc` retorna substring matches que incluem "AC/DC UK", "Live/Wire — The AC/DC Show" etc.

**Como adicionar um novo artista ao map:**

1. Buscar o MBID em <https://musicbrainz.org/> (campo "MBID" do artista).
2. Confirmar que o MBID retorna setlists em `https://api.setlist.fm/rest/1.0/search/setlists?artistMbid={mbid}`.
3. Adicionar ao map com a chave em lowercase, sem acentos nem apóstrofos:
   ```ts
   "the killers": { mbid: "95e1ead9-...", name: "The Killers" }
   ```
4. Adicionar caso de teste em `tests/unit/setlist-api.test.ts` (`findKnownArtistFromPrefix`).

## Cache

| Camada | Onde | TTL | Chave |
|---|---|---|---|
| Cache do route handler | `lib/setlist-cache.ts` | 6h | `search:{lower}:{page}` |
| Cache de `/search/artists` | mesmo cache | 24h (hit) / 30min (404) | `artists:{lower}` |
| `Next.js fetch revalidate` | `lib/setlist-api.ts` | 6h busca / 24h artistas | URL completa |
| Cache HTTP do navegador | header `Cache-Control` | 1min cliente / 6h CDN | URL completa |

O cache é LRU com limite de 600 entradas (`MAX_CACHE_ENTRIES` em `setlist-cache.ts`). Reinicio do dev server limpa o cache em memória.

## Testes

Cobertura unitária em `tests/unit/setlist-api.test.ts`:

| Bloco | O que valida |
|---|---|
| `parseStructuredQuery` | Reconhecimento de separadores, ano, país, aliases, blank input |
| `applyArtistAliases` | Reescrita correta de aliases |
| `countryNameToCode` | Mapeamento de nomes + opt-in para códigos de 2 letras |
| `extractTrailingCountry` | Detecção de país no final da string |
| `scoreArtistAgainstPrefix` | Scoring do MBID match |
| `findKnownArtistFromPrefix` | Atalho via KNOWN map |
| `searchSetlists` (com fetch mock) | Pipeline end-to-end: direct hit, MBID shortcut, resolução, fallbacks |

Rodando localmente:

```bash
npm run test:unit
```

Os testes mockam `globalThis.fetch` — **não fazem chamadas reais à API**. CI roda automaticamente em todo push/PR via `.github/workflows/release-quality.yml`.

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
