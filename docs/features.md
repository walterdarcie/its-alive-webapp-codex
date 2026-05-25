# Features — it's alive

> Inventário de funcionalidades, user flows e regras de negócio.

## 1. Autenticação (Google OAuth)

**Fluxo:**
1. Usuário acessa `/login` ou `/signin`
2. Clica "Entrar com Google"
3. `supabase.auth.signInWithOAuth({ provider: "google", redirectTo: "/auth/callback" })`
4. Google redireciona para `/auth/callback?code=xxx&next=/`
5. `exchangeCodeForSession()` troca code por sessão
6. Redirect para `next` (sanitizado — apenas caminhos internos)

**Proteção de rotas:**
- `requireServerUser()` em `app/page.tsx` → redireciona para `/login` se não autenticado
- `/login` e `/signin` redirecionam para `/` se já autenticado

**Middleware:**
- `middleware.ts` executa em toda request via Vercel Edge
- Chama `createSupabaseServerClient()` → `supabase.auth.getUser()` para renovar cookie

**Sign out:** POST `/api/auth/signout` → `supabase.auth.signOut()` → redirect para `/login`

---

## 2. Busca de Shows (Setlist.fm + Ticketmaster)

**Fluxo:**
1. Usuário digita na `SearchPageClient` (debounce 420ms)
2. GET `/api/setlists/search?searchTerm=...&p=...`
3. Na página 0: Setlist.fm e Ticketmaster Discovery API são chamados em paralelo
   - Setlist.fm retorna shows passados com setlists
   - Ticketmaster retorna shows futuros com `ticketUrl` quando ingresso está à venda (`status === "onsale"`)
4. Resultados mesclados, deduplicados por ID e ordenados: futuros primeiro (ordem cronológica), passados depois (ordem decrescente)
5. Resultado cacheado in-memory por 6h (busca) / 1h (Ticketmaster)
6. Cards exibidos; clique abre detalhe em overlay com `initialData` pré-populado para shows Ticketmaster

**Prefixo `tm-`:** IDs de shows Ticketmaster começam com `tm-`. Esses shows não têm setlist disponível e o botão SETLIST.FM não é exibido.

**Botão de ingressos:** Shows com `ticketUrl` e data futura exibem `.ticketBuyRow` (lista) e chip "INGRESSOS" (detalhe). O botão desaparece depois que o show acontece.

**Paginação:** parâmetro `p` (0-indexed). Páginas > 0 consultam apenas o Setlist.fm.

**Rate limiting:** se Setlist.fm retornar 429, a API retorna 429 com mensagem amigável em PT-BR. Erros do Ticketmaster são silenciosos (retorna lista vazia).

---

## 3. Detalhe do Show (Setlist)

**Fluxo:**
1. Acesso direto via `/show/{id}` OU overlay a partir de busca/wallet
2. Para shows Setlist.fm: `getSetlistById(id)` → cache 24h (com setlist) ou 5min (sem setlist)
3. Para shows Ticketmaster (`tm-*`): `initialData` passado diretamente pelo `SearchPageClient`, sem chamada de API
4. `ShowDetailClient` renderiza header com foto do artista, metadados do show, setlist secionado

**Botão de ingressos:** exibido quando `show.ticketUrl` está presente e `isFutureOrTodayShow(eventDateIso)` retorna `true`. Desaparece após o show acontecer. Analytics: evento `ticket_buy_click` com `{ show_id, source: "show_detail" }`.

**Botão SETLIST.FM:** suprimido para shows com `id.startsWith("tm-")` pois não há setlist externo.

**Resolução de imagem do artista:**
- Cascata: MusicBrainz (quando tem `artistMbid`) → **Deezer** (primeira tentativa por nome — 1000×1000 quadrada) → Wikipedia/Wikidata (fallback com filtros de contexto musical e checagem de título) → **Headliner do show composto** (último fallback: primeiro nome quando o show tem múltiplos artistas separados por `&`, `+`, `,`, `feat`, `ft`)
- Normalização ignora apóstrofes na comparação ("Marky Ramone's Blitzkrieg" ↔ "Marky Ramones Blitzkrieg" do Deezer)
- Sem fallback permissivo: se nada bate com confiança, devolve `source: "none"` em vez de adivinhar (evita Lenin pelo Lenine, Chico Xavier pelo Chico Chico)
- Cache HTTP 7 dias na CDN Vercel

**Ticket visual:**
- Elemento `.detailBodyTicket` usa CSS mask para criar efeito de borda serrilhada
- Divide header (foto/info) do corpo (setlist + feed)

---

## 4. Wallet (Shows Salvos)

**Modelo de dados:** `wallet_entries` no Supabase, chave `(user_id, setlist_id)`.

**Status automático:** `deriveWalletStatus(eventDateIso)` compara com hoje → `"going"` (futuro) ou `"went"` (passado).

**Tabs:** "Próximos" (going) e "Histórico" (went) na home.

**Sincronização client-server:**

| Etapa | Trigger | Ação |
|---|---|---|
| Hidratação | Montar HomeClient | GET `/api/wallet` → merge com localStorage |
| Salvar | Clicar em salvar show | localStorage imediato + POST `/api/wallet` |
| Remover | Clicar em remover show | localStorage imediato + DELETE `/api/wallet?showId=...` |
| Sync pendentes | Cada hidratação | Tenta reenviar operações que falharam |
| Re-sync | Evento `focus` | Re-lê servidor |
| Multi-aba | Evento `storage` | Re-lê localStorage |

**Offline:** operações que falham são enfileiradas e reenviadas na próxima hidratação.

---

## 5. Feed Social (Posts por Show)

**Acesso:** visível para todos, inclusive não autenticados (read-only).

### Criar Post

1. Usuário escreve texto (1–1000 chars) no formulário dentro de `ShowFeedClient`
2. Opcionalmente, seleciona foto (imagem ≤ 10MB)
3. Se há foto: upload direto do browser para Supabase Storage
   - Caminho: `post-photos/{userId}/{timestamp}-{random}.{ext}`
   - Retorna URL pública
4. POST `/api/posts/{showId}` com `body` + `photoUrl?`
5. Nome e avatar do autor são desnormalizados na tabela (`user_display_name`, `user_avatar_url`)
6. Post aparece no topo do feed imediatamente

### Curtir Post ("Mandar um rock'n'roll")

A única ação interativa de um post é o "rock'n'roll" — substituiu o coração tradicional para ficar no idioma do produto.

1. Clique no ícone de horns (mão fazendo 🤘 — `RockOnIcon`) → atualização otimística imediata no estado local
2. POST `/api/posts/{showId}/{postId}/like` (rota e tabela seguem `post_likes` / `like_count` como antes — só a UI muda)
3. Toggle: insere ou remove de `post_likes`. Trigger PostgreSQL mantém `like_count`.
4. Se a ação foi um **like novo** (não unlike), dispara `isBursting` por 620ms: o ícone bounce (`rockHornsBurst`) + 6 partículas que voam em 60° de espaçamento (`rockSparkFly`).
5. Contador (`feedPostLikeCount`) aparece à direita do ícone quando `likeCount > 0`. No estado liked, ícone e contador ganham gradiente pink → coral.
6. Se erro de rede: reverte estado local (mantém o feedback otimístico até a resposta vir).

Os antigos botões **Comentar** e **Compartilhar** foram removidos dos posts — comentário não estava implementado de verdade (só dava foco no textarea) e o compartilhar agora vive no detalhe do show, onde tem mais contexto.

### Excluir Post

1. Ícone de lixeira aparece no hover do próprio post (`viewer.id === post.userId`)
2. Clique exibe confirmação inline: "Excluir? **Sim** / Não"
3. Confirmação: DELETE `/api/posts/{showId}/{postId}`
4. Post removido otimisticamente do estado local antes da resposta
5. Segurança dupla: query `.eq("user_id")` + RLS PostgreSQL

### Compartilhar Show (no detalhe)

1. Botão `COMPARTILHAR` (`shareChip`) na barra de ações do `ShowDetailClient`, ao lado do "EU VOU/FUI!" e do botão de ingressos.
2. Tenta `navigator.share` ({title, text, url}) — suporte mobile/iOS/Android.
3. Fallback: `navigator.clipboard.writeText(url)`. Quando cai no fallback, o botão muda para "LINK COPIADO" por 1.8s.
4. Evento de analytics: `show_share_click` com `{ show_id }`.

---

## 6. Rede Social (release `release-social-update`)

A home logada virou uma rede social de "diário de shows". O viewer pode seguir outros usuários, ver as atividades de quem segue e descobrir shows em alta.

### Home — Abas `Novidades` / `Meus shows`

| Tab | Conteúdo |
|---|---|
| `Novidades` (default) | `Shows em alta` (carrossel) + `Seguindo` (feed vertical) |
| `Meus shows` | `Eu vou!` (carrossel) + tickets passados agrupados por ano |

O parâmetro `?tab=meus-shows` deep-linka a aba (usado pelo drawer e por testes). A troca local de aba atualiza o URL via `replaceState`.

### Perfil próprio (cabeçalho)

- Avatar 88px (72px em telas ≤ 480px), nome (18px / 700)
- **Primário (em destaque, gradiente pink → coral):** contagem de shows que a pessoa foi
  - `X em {ano atual}` (apenas shows passados do ano corrente)
  - `Y no total` (apenas shows passados, total)
- **Secundário (texto pequeno, uppercase):** `SEGUINDO` e `SEGUIDORES`
- Formatação pt-BR com separador (`9.999.999`); zero em `SEGUINDO/SEGUIDORES` exibido como `—`
- Contagem de shows usa `countAttendedShows()` em `lib/social-utils.ts` — só inclui shows com `eventDateIso` no passado (i.e., `!isFutureOrTodayShow`)
- Clicar em `SEGUINDO` → `/u/{userId}/seguindo`; clicar em `SEGUIDORES` → `/u/{userId}/seguidores`
- `font-variant-numeric: tabular-nums` para estabilidade visual quando o número atualiza

### Drawer lateral (menu)

Acionado pelo botão hambúrguer (substituiu o avatar com menu antigo). Itens topo: `Meus shows`, `Buscar shows`, `Buscar amigos`. Itens base: `Termos de uso`, `Privacidade`, `Sair`. Slide-in 320ms da direita com backdrop blurred. ESC + clique fora fecham.

### Feed "Seguindo"

Lê `/api/feed/following`. Cada item: avatar + nome em bold + verbo `Foi` (memória, `pink-light`) ou `Vai` (antecipação, `blue-glow`), seguido do ticket do show. Estado vazio convida a buscar amigos.

> Ordem **cronológica pela data do show**: futuros primeiro (próximo de hoje no topo), depois passados em ordem decrescente. Combina com o tom de antecipação do "Vai" + memória do "Foi" — a referência temporal visível é a data do show.

> O verbo é **derivado da data do show** (`isFutureOrTodayShow → "Vai"`, senão `"Foi"`), não da coluna `status` armazenada. Garante que shows passados marcados originalmente como "Vai" virem `"Foi"` automaticamente com o tempo.

> A data do post (`occurredAtIso`) não é exibida no cabeçalho do item — a referência temporal é a data do show, mostrada no ticket logo abaixo. Isso evita duplicidade visual ("hoje" vs. "20 jun 2026") quando o usuário acabou de marcar um show futuro.

### Carrossel "Shows em alta" + lista "Mais em alta"

Lê `/api/shows/trending`. Duas fontes mescladas:

1. **Sinal da plataforma**: `wallet_entries` futuros (`status = "going"`) agrupados por `setlist_id` ordenados por contagem desc — quanto mais usuários marcam "Eu vou", mais alto.
2. **Fonte de descoberta**: Ticketmaster Discovery API (`classificationName=music`, `sort=date,asc`) preenche os slots restantes quando a plataforma ainda não tem volume.

Limite 24. Dedup em duas passadas: (1) por `id` com prioridade pra plataforma, (2) **por artista** (cada artista aparece no máximo uma vez na lista). Cache de 1h no Ticketmaster (chave inclui filtros). Quando vazio (sem TM key, sem dados, sem internet, ou filtros muito restritivos), a seção renderiza um estado vazio "Nenhum show por aqui com esses filtros".

**Filtros (UI: `TrendingFiltersBar`)** — aplicam-se à seção inteira, todos numa única linha compacta:

| Filtro | Tipo | Default | Onde aplica |
|---|---|---|---|
| País | dropdown | `BR` | Ticketmaster (`countryCode`) + wallet (fuzzy match em `show.country`) |
| Cidade | input livre | _(vazio)_ | Ticketmaster (`city=`) + wallet (substring case-insensitive em `show.city`) |

> O filtro de **gênero** foi removido da UI por ocupar muito espaço sem trazer recorte útil para esta fase. O backend ainda aceita `?genre=` em `/api/shows/trending` (sem uso pelo cliente).

Mudança em filtro → debounce 300ms → refetch `/api/shows/trending?country=…&city=…`. Botão "Limpar" aparece quando qualquer filtro estiver fora do default e zera tudo. Cada interação gera evento `trending_filter_change` (`kind`, `value`).

**Renderização na home:**
- Os 3 primeiros entram em um carrossel horizontal usando `EventCard` (com a badge "Faltam X dias!").
- Os demais (até 21) aparecem em uma lista compacta abaixo, com header pequeno "Mais em alta" e cada item em `TicketRow`.
- Clicar em qualquer card abre o `ShowDetailClient` em overlay com `initialData` pré-populado — o detalhe não precisa fazer fetch (vital para shows `tm-*`, já que `/api/setlists/tm-*` retorna 404).

### Busca dupla (`/search?tab=...`)

- Aba `Shows` (default): pipeline existente em `/api/setlists/search`.
- Aba `Amigos`: `/api/profiles/search?q=...` (debounce 350ms). Cada resultado renderiza avatar (link para `/u/[userId]`), nome (link) e `FollowButton` inline.

### Página `/u/[userId]`

Server component faz `fetch` interno em `/api/profiles/[userId]` + `/api/profiles/[userId]/wallet` repassando o cookie da request. Client renderiza:

- `ProfileHeader` com contadores de shows (este ano + total) em destaque + SEGUINDO/SEGUIDORES secundários + CTA `Seguir`/`Seguindo` (`FollowButton` otimístico) ou link de login.
- Carrossel "Vai!" para shows futuros + tickets passados agrupados por ano — mesmo formato da aba "Meus shows" da home.
- Estado vazio: `"X ainda não guardou shows por aqui."`.

> Antes da release 2026-05-18 a wallet de outro usuário aparecia vazia por causa da RLS `wallet select own`. A migration `20260518120000_wallet_entries_public_select.sql` flexibilizou a policy para SELECT público (escrita continua só do dono).

### Seguir/Deixar de seguir

`POST /api/follows/[userId]` (upsert idempotente em `user_follows`) e `DELETE` (idempotente). A UI usa `FollowButton` que faz atualização otimística e reverte em caso de erro. Self-follow → `400`.

### Páginas `/u/[userId]/seguindo` e `/u/[userId]/seguidores`

Listam pessoas que o usuário-alvo segue ou que o seguem. Server components consomem `/api/profiles/[userId]/follows?type={following|followers}`.

- Cabeçalho com título grande + subtítulo descritivo (`"Pessoas que você está acompanhando."`, etc.)
- Botão `Voltar para o perfil de X` (ou `Voltar para a home`, se for o próprio viewer)
- Switch entre as duas abas (`Seguindo` / `Seguidores`) no estilo pill, com `aria-current="page"` na ativa
- Cada item usa `friendResultRow` (mesmo do search/amigos): avatar + nome (linkam para `/u/[userId]`) + `FollowButton` à direita
- Para o próprio viewer, o botão de follow é omitido
- Anônimo vê o botão `Entrar` no lugar do `FollowButton`
- Estados vazios contextuais (`"Você ainda não segue ninguém..."`, etc.)

### Grafo social e contadores

Contadores derivam direto de `user_follows` (via `COUNT(*)` headless). Não há cache server-side ainda — o cálculo é fresco a cada requisição. Ver `docs/database.md` para a definição da tabela.

---

## 7. Internacionalização (i18n)

**Idiomas suportados:** português (`pt`, padrão), inglês (`en`), espanhol (`es`).

**Detecção:** automática via `navigator.languages[0] ?? navigator.language` no `LocaleProvider`. Sem seletor de idioma na UI — o browser define o idioma conforme a localização/preferência do usuário.

**Arquitetura:**
- `lib/i18n.ts` — tipos `Locale`, `LocaleDict` e constantes
- `lib/i18n-context.tsx` — `LocaleProvider` (detecta locale, atualiza `document.documentElement.lang`) e `useLocale()` hook
- `lib/locales/pt.ts`, `en.ts`, `es.ts` — dicionários tipados com `LocaleDict`
- `app/layout.tsx` — envolve toda a árvore com `<LocaleProvider>`

**Hook `useLocale()`:** retorna `{ locale, t, formatDate, formatPostDate }`.
- `t` — dicionário tipado com todas as strings da UI
- `formatDate(isoDate)` — `"15 MAR 2025"` (uppercase, mês conforme locale)
- `formatPostDate(isoTimestamp)` — `"15 mar 2025"` (lowercase, mês conforme locale)

**Regra:** toda string visível ao usuário passa por `t.*`. Valores de URL (ex.: `"novidades"`, `"amigos"`) permanecem em português (são segmentos de rota, não texto UI).

---

## 8. Analytics (Google Analytics 4)

**ID:** `G-LDQLEFB0DR`

- Page tracker automático em `app/layout.tsx`
- `trackEvent(name, params)` disponível para eventos manuais

---

## Regras de Negócio

| Regra | Detalhe |
|---|---|
| Body do post | 1–1000 caracteres, validado no cliente e no servidor |
| Foto | Apenas imagens (jpeg/png/webp/heic/heif), máximo 10MB |
| Caminho de storage | Sempre `{userId}/` como primeiro segmento — garante que usuário só suba para sua própria pasta (Storage policy) |
| `like_count` | Nunca negativo (`greatest(0, like_count - 1)` no trigger) |
| Delete de post | Apenas o autor (`user_id` na query + RLS) |
| Wallet upsert | `onConflict: "user_id,setlist_id"` — salvar duas vezes não duplica |
| Status da wallet | Calculado em runtime por `deriveWalletStatus`, não armazenado como verdade absoluta |
| Redirect pós-login | Apenas caminhos internos aceitos (sanitização no `/auth/callback`) |
| Cache Setlist.fm | 6h para busca, 24h para detalhe com setlist, 5min para detalhe sem setlist |
| Cache Ticketmaster | 1h para shows futuros por artista |
| `ticketUrl` presente | Apenas quando `dates.status.code === "onsale"` na resposta do Ticketmaster |
| Botão ingressos | Visível somente se `ticketUrl` existe E `isFutureOrTodayShow()` retorna true |
| Self-follow | Impossível — endpoint retorna 400 e DB tem `check (follower_id <> following_id)` |
| Contadores zero | Renderizados como `—` em vez de `0` (escolha de tom — ver `docs/voice.md`) |
| Verbos do feed | `Foi` em `pink-light` (memória), `Vai` em `blue-glow` (antecipação) — diferenciação cromática deliberada |
| Agrupamento por ano | Ano renderizado só como número (`2025`, não `ANO 2025`); ordem decrescente dentro de cada ano |
| Trending shows | Agrupa `wallet_entries` com `status = "going"` e `event_date >= today`; ordena por contagem desc. Dedup por `id` e por nome de artista (normalizado). Limite 24. |
| Trending split | UI da home usa os 3 primeiros no carrossel "Shows em alta" e o resto na lista "Mais em alta" |
| Contagem de shows no perfil | Soma apenas shows passados (`!isFutureOrTodayShow`). "Este ano" filtra ainda por `yearFromEventDateIso === ano atual` |
| Verbo no feed (Foi/Vai) | Derivado em runtime da data do show, não da coluna `status` armazenada |
| Bordas dashed em tickets | Pintadas com `var(--bg-primary)` para criarem efeito de transparência sobre o fundo da página |
