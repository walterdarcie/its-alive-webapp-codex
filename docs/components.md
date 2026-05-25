# Componentes — it's alive

> Convenção: Server Components em `app/[rota]/page.tsx`; Client Components em `app/ui/*-client.tsx`. Nenhum `default export`.

## Árvore de componentes

```
RootLayout (app/layout.tsx) — Server
  ├── GoogleAnalytics (app/layout.tsx, inline)
  ├── app/page.tsx — Server
  │     └── HomeClient (app/ui/home-client.tsx) — Client
  │           ├── ProfileHeader (app/ui/profile-header.tsx) — Client
  │           └── SocialDrawer (app/ui/social-drawer.tsx) — Client
  ├── app/search/page.tsx — Server
  │     └── SearchPageClient (app/ui/search-page-client.tsx) — Client
  │           ├── SocialDrawer — Client
  │           └── FollowButton (app/ui/profile-header.tsx) — Client
  ├── app/u/[userId]/page.tsx — Server
  │     └── ProfileUserClient (app/ui/profile-user-client.tsx) — Client
  │           ├── ProfileHeader — Client
  │           ├── FollowButton — Client
  │           └── SocialDrawer — Client
  ├── app/u/[userId]/seguindo/page.tsx — Server
  │     └── FollowListClient (app/ui/follow-list-client.tsx) — Client
  │           ├── FollowButton — Client
  │           └── SocialDrawer — Client
  ├── app/u/[userId]/seguidores/page.tsx — Server
  │     └── FollowListClient — mesmo componente, com `type="followers"`
  ├── app/show/[id]/page.tsx — Server
  │     └── ShowDetailClient — Client (página dedicada, sem overlay)
  │           ├── SocialDrawer — Client
  │           └── ShowFeedClient — Client
  ├── app/login/page.tsx — Server
  │     └── LoginClient (app/ui/login-client.tsx) — Client
  └── app/signin/page.tsx — alias de /login
```

---

## Server Pages

### `app/page.tsx`

Página inicial. Redireciona para `/login` se não autenticado (`requireServerUser()`). Busca wallet do usuário e repassa para `HomeClient`.

**Props passados para HomeClient:** `{ wallet: WalletPayload, viewer: Viewer }`

### `app/show/[id]/page.tsx`

Página de detalhe de um show. Carrega dados do setlist via `getSetlistById(id)`, resolve imagem do artista, obtém viewer.

**Props passados para ShowDetailClient:** `{ show: ShowDetailRecord, viewer: Viewer | null }`

### `app/search/page.tsx`

Página de busca. Sem dados iniciais do servidor — busca é feita client-side.

**Props passados para SearchPageClient:** `{ viewer: Viewer | null }`

---

## Client Components

### `HomeClient` — `app/ui/home-client.tsx`

Página principal da release social. Header com hambúrguer + drawer, barra de busca, bloco de perfil (avatar 96px + nome + contadores), abas `Novidades` / `Meus shows`.

**Props:**
```ts
{ viewer: ViewerProfile; initialTab?: "novidades" | "meus-shows" }
```

**Estado:**
- `walletEntries` — wallet sincronizada (localStorage + servidor)
- `artistImageMap` — cache local de imagens de artistas resolvidas
- `activeTab` — aba ativa, sincronizada com `?tab=` no URL
- `drawerOpen` — visibilidade do `SocialDrawer`
- `profile` — `UserProfileWithCounts | null` (consome `/api/profiles/me`)
- `trending` — `TrendingShow[]` (consome `/api/shows/trending`)
- `trendingFilters` — `{ country, city, genre }`. Default `{ country: "BR", city: "", genre: "" }`. Mudança → debounce 300ms → refetch.
- `feedItems` — `FollowFeedItem[]` (consome `/api/feed/following`)

**Comportamento:**
- Hidrata wallet do servidor ao montar
- Aba Novidades: renderiza `TrendingShowsPanel` (filtros + carrossel + lista "Mais em alta") + `FollowingFeedPanel`
- Aba Meus shows: `Eu vou!` (carrossel) + tickets agrupados por ano com `groupShowsByYearDesc`
- Clicar em um show navega para `/show/[id]` via `router.push()` — não usa overlay; o detalhe é uma página dedicada.
- Skeletons enquanto trending/feed carregam

---

### `SearchPageClient` — `app/ui/search-page-client.tsx`

Busca dupla com abas `Shows` / `Amigos`. Mantém o pipeline de busca de shows existente; adiciona busca de usuários.

**Props:**
```ts
{
  viewer: ViewerProfile | null;
  isAuthenticated?: boolean;
  initialQuery?: string;
  initialTab?: "shows" | "amigos";
}
```

**Estado:**
- `query`, `deferredQuery` — texto da busca + valor diferido (rendering otimizado)
- `activeTab` — `"shows" | "amigos"`, sincronizada com `?tab=` no URL
- `drawerOpen` — abre `SocialDrawer`
- Shows: `searchResults`, `searchLoading`, `searchLoadingMore`, `searchError`, `searchMeta` (`pageLoaded`, `hasMore`, `total`)
- Amigos: `friendResults` (`UserProfileSummary[]` com `isViewerFollowing`), `friendLoading`, `friendError`

**Comportamento:**
- Tab `Shows`: debounce 700ms → `/api/setlists/search` + scroll infinito por sentinel; placeholder "Encontre shows incríveis"
- Tab `Amigos`: debounce 350ms → `/api/profiles/search`; placeholder "Encontre amigos pelo nome"; render `FriendResultRow` com `FollowButton` inline
- Clicar em um show navega para `/show/[id]` via `router.push()`
- `SocialDrawer` controlado pelo hambúrguer (apenas autenticado)

---

### `ShowDetailClient` — `app/ui/show-detail-client.tsx`

Página dedicada do show (não é mais modal/overlay). Layout em formato de "ticket": topbar com botão **Voltar** (`arrow-left`) à esquerda + logo central + menu hambúrguer; abaixo o `ticketCard` em azul saturado (`--surface-card`) com:
1. Cabeçalho (data, artista em Anton, venue)
2. Perfuração proeminente (`ticketCardPerf`): linha dashed `4px` com gap `28px` + dois semicírculos de `40px` nas laterais simulando o recorte de um ticket
3. Foto do artista (`ticketCardHero`)
4. Linha primária de ação (`ticketCardActions`): avatares sobrepostos dos últimos atendentes + contador em pink; CTA `EU FUI/VOU` alinhado à direita com burst de sparks no clique
5. Linha secundária (`ticketCardSecondaryActions`): chips de Ingressos, Compartilhar, Setlist.fm
6. Setlist
7. `ShowFeedClient`

**Props:**
```ts
{
  id: string;
  initialData?: ShowDetailRecord | null;
  isAuthenticated?: boolean;
  viewer?: Viewer | null;
}
```

**Estado:**
- `show: ShowDetailRecord | null` — dados (hidrata de `initialData` + `/api/setlists/[id]`)
- `saved`, `savingWallet`, `lastSyncFailed`, `ctaBurst` — wallet + animação
- `setlistExpanded` — ver tudo / recolher
- `artistImageUrl` — foto resolvida
- `shareConfirm: "idle" | "copied"` — feedback do botão compartilhar
- `attendees: AttendeesPayload | null` — total + últimos 4 atendentes (consome `/api/shows/[id]/attendees`)
- `drawerOpen` — hambúrguer

**Comportamento:**
- `handleBack()` → `router.back()` (fallback `router.push("/")`)
- Salvar/remover da wallet (otimístico); dispara `ctaBurst` que toca `ctaPressBurst` + `ctaSparkFly` (mesma estética do burst do botão de like).
- Compartilhar com `navigator.share` (fallback clipboard + "LINK COPIADO" por 1.8s).
- Carrega atendentes ao montar e a cada mudança em `saved`.

---

### `ShowFeedClient` — `app/ui/show-feed-client.tsx`

Feed social de um show específico. Posts, likes, fotos, delete.

**Props:**
```ts
{ showId: string; viewer: Viewer | null }
```

**Estado:**
- `posts: Post[]` — lista carregada de `/api/posts/{showId}`
- `loading` — carregamento inicial
- `body` — texto do novo post
- `photoFile: File | null` — foto selecionada
- `photoPreview: string | null` — object URL para preview
- `submitting` — envio em andamento
- `submitError: string | null` — erro de envio
- `confirmDeleteId: string | null` — ID do post aguardando confirmação de exclusão

**Estado adicional:**
- `burstingId: string | null` — id do post cujo botão de like está rodando a animação `isBursting`. Setado por 620ms após um like novo (não rola em unlike). Usado para condicionar `.isBursting` na classe do botão.

**Comportamento:**
- Carrega posts ao montar (cancela fetch se desmontado)
- Upload de foto: direto ao Supabase Storage via `getSupabaseBrowserClient()`
  - Caminho: `post-photos/{viewer.id}/{timestamp}-{random}.{ext}`
  - Limite: 10 MB, apenas imagens
- Envio de post: POST `/api/posts/{showId}` com `body` + `photoUrl?`
- **Curtir** (rock'n'roll): POST `/api/posts/{showId}/{postId}/like` — atualização otimística. Ícone é `RockHandSvg` (mão fazendo horns, importado de `lib/brand-svg.tsx`, herda `color` via `fill="currentColor"`); estado não-curtido fica em `--text-muted`, curtido vira pink (`--gradient-a`); like novo dispara burst (`rockHornsBurst` no ícone + 6 `rockBurstSpark` em 60° de espaçamento, `rockSparkFly`).
- Contador aparece à direita do ícone só quando `likeCount > 0`. Em estado liked, ícone e contador compartilham o gradiente pink.
- Delete: ícone visível no hover do próprio post → confirmação inline → DELETE `/api/posts/{showId}/{postId}`
- **Compartilhar foi removido** do post — agora vive só no `ShowDetailClient` (mais contexto).
- **Comentar foi removido** — antes só dava foco no textarea de novo post, comportamento confuso.
- Usuário não autenticado vê o feed mas não pode postar nem curtir (redireciona para `/signin?next=...`)

**Ícones internos (SVG inline):**
`CameraIcon`, `CloseSmIcon`, `TrashIcon`. O ícone de curtir é o componente compartilhado `RockHandSvg` (`lib/brand-svg.tsx`).

---

### `ProfileHeader` + `FollowButton` — `app/ui/profile-header.tsx`

Bloco de perfil reutilizado por `HomeClient` (próprio usuário) e `ProfileUserClient` (perfil de outro).

**`ProfileHeader` Props:**
```ts
{
  profile: UserProfileWithCounts | null;
  fallbackName: string;
  fallbackAvatarUrl: string | null;
  showsThisYear: number;
  showsTotal: number;
  primaryAction?: ReactNode;
}
```

Renderiza:
- Avatar circular 88px (72px em telas ≤ 480px)
- Nome em 18px / 700, letter-spacing apertado
- **Primário (`profileShowStats`):** dois números grandes em gradiente `pink → coral` (`--gradient-a` → `--gradient-b`). Cada número vem com um `profileShowStatLabelGroup` empilhando duas linhas: rótulo "shows" (em `profileShowStatLabelTop`, lowercase + tracking largo) por cima do qualificador "em {ano atual}" / "no total". Apenas shows passados (`!isFutureOrTodayShow`); "este ano" filtra ainda por ano corrente. Os valores vêm do parent (`countAttendedShows` em `lib/social-utils.ts`).
- **Secundário (`profileStats.profileStatsSecondary`):** SEGUINDO e SEGUIDORES em texto pequeno (10–11px), uppercase, com letter-spacing largo. Zero é renderizado como `—`. Cada link aponta para `/u/{userId}/seguindo` ou `/u/{userId}/seguidores`.
- `font-variant-numeric: tabular-nums` para estabilidade visual quando os números atualizam.

**`FollowButton` Props:**
```ts
{
  targetUserId: string;
  initialFollowing: boolean;
  onChange?: (following: boolean, followerCount: number) => void;
  source: string;
}
```

Toggle otimístico contra `/api/follows/[userId]` (POST/DELETE). Reverte estado local em caso de falha. Classes: `.ctaMain.followBtn` (não seguindo) / `.ctaMain.followBtn.isFollowing` (seguindo).

---

### `SocialDrawer` — `app/ui/social-drawer.tsx`

Drawer lateral direito com itens de navegação. Usado em `HomeClient`, `SearchPageClient` e `ProfileUserClient`.

**Props:**
```ts
{ open: boolean; onClose: () => void; source: string }
```

**Comportamento:**
- Slide-in de 320ms (cubic-bezier 0.22, 1, 0.36, 1) + backdrop com `blur(8px) saturate(140%)`
- ESC, clique no backdrop ou em item navegacional fecham
- Itens entram em cascade com `animation-delay` incrementando 40ms
- Bloco superior (font 28-34px / weight 400): Meus shows, Buscar shows, Buscar amigos
- Bloco inferior (font 22px / weight 400 / text-secondary): Termos de uso, Privacidade, **Sair** (botão que chama `/api/auth/signout`)
- Itens topo direcionam para `/?tab=...` ou `/search?tab=...`
- O drawer usa `height: 100dvh` + `overflow-y: auto` + `padding-bottom: calc(28px + env(safe-area-inset-bottom))` para garantir que o botão **Sair** sempre fique acessível mesmo em viewports baixos / browsers mobile com barra de navegação variável.

---

### `ProfileUserClient` — `app/ui/profile-user-client.tsx`

Página de perfil de outro usuário (`/u/[userId]`). Server component carrega `profile` + `wallet` em paralelo (`fetchJson` repassando cookies).

**Props:**
```ts
{
  profile: UserProfileWithCounts;
  wallet: PublicWalletEntry[];
  viewer: ViewerProfile | null;
  isAuthenticated: boolean;
}
```

**Comportamento:**
- Header `topBarSocial showDetailTopBar` em grid `auto 1fr 40px`: botão `Voltar` (`showDetailBackBtn` com ícone arrow-left) à esquerda, logo central, hambúrguer à direita (só autenticados). Mesma estrutura usada pelo `ShowDetailClient`.
- `handleBack()` → `router.back()` se há histórico (`window.history.length > 1`); fallback `/`.
- `ProfileHeader` (com `showsThisYear` + `showsTotal` calculados via `countAttendedShows`) com CTA: `FollowButton` (não-self autenticado), "Entrar para seguir" (anônimo) ou `null` (próprio usuário)
- Section "Vai!" como carrossel quando há futuros + `groupShowsByYearDesc` para passados — mesmo formato da aba "Meus shows" da home; cliques navegam para `/show/[id]`.
- Estado vazio: "X ainda não guardou shows por aqui."

---

### `FollowListClient` — `app/ui/follow-list-client.tsx`

Listagem de pessoas para `/u/[userId]/seguindo` e `/u/[userId]/seguidores`.

**Props:**
```ts
{
  ownerUserId: string;
  ownerDisplayName: string;
  ownerIsViewer: boolean;
  type: "following" | "followers";
  items: FollowListItem[];
  viewer: ViewerProfile | null;
  isAuthenticated: boolean;
}
```

`FollowListItem` é `UserProfileSummary & { isViewerFollowing: boolean; isSelf: boolean }`.

**Comportamento:**
- `topBarSocial` com hambúrguer (só para autenticados)
- Link "Voltar para o perfil de X" ou "Voltar para a home" (se o owner é o próprio viewer)
- Cabeçalho `followListHeader` com título grande + subtítulo contextual
- Switch `followListSwitch` (pill com 2 botões) entre Seguindo e Seguidores
- Lista usando `friendResultRow` (mesmo layout do search/amigos): avatar + nome (linkam para `/u/[userId]`) + `FollowButton` na direita
- Para o próprio item do viewer, omite o botão. Anônimo vê botão "Entrar"
- Estados vazios contextuais (varia por `type` e `ownerIsViewer`)

---

### `LoginClient` — `app/ui/login-client.tsx`

Tela de login. Botão "Entrar com Google" → `supabase.auth.signInWithOAuth`.

**Props:** nenhum.

---

## Lib / Utilitários

### `lib/show-types.ts`

Tipos compartilhados:

| Tipo | Descrição |
|---|---|
| `Viewer` | `{ id, name, avatarUrl }` — usuário autenticado |
| `ShowRecord` | Dados básicos de um show |
| `ShowDetailRecord` | `ShowRecord` + `songNames[]` + `setlistSections[]` |
| `WalletStatus` | `"going" \| "went"` |
| `SetlistFmSetlist` | Forma raw da API Setlist.fm |

**Funções exportadas:**
- `mapSetlistToShowRecord(raw)` — raw → `ShowRecord | null`
- `mapSetlistToShowDetailRecord(raw)` — raw → `ShowDetailRecord | null`

### `lib/show-utils.ts`

Helpers de formatação sem efeitos colaterais:

- `formatDatePtBrLong(isoDate)` — `"2026-03-10"` → `"10 MAR 2026"` (curto, sem "de")
- `formatPostDate(isoTimestamp)` — `"2025-12-31T..."` → `"31 dez 2025"`
- `deriveWalletStatus(isoDate)` — compara com hoje → `"going" | "went"`
- `yearFromEventDateIso(isoDate)` — devolve o YYYY (`"2025"`)
- `groupShowsByYearDesc(items)` — agrupa por ano (mais novo primeiro) e ordena cada grupo decrescente

### `lib/social-types.ts`

Tipos compartilhados do mundo social:

- `UserProfileSummary` — `{ userId, displayName, avatarUrl }`
- `UserProfileWithCounts` — soma `followingCount`, `followerCount`, `isViewerFollowing`, `isSelf`
- `FollowFeedItem` — `{ id, actor, action, occurredAtIso, show }`
- `TrendingShow` — `{ show, attendingCount }`
- `PublicWalletEntry` — `{ show, action, savedAtIso }`
- `formatPtBrNumber(value)` — separador pt-BR com `—` para 0/inválido

### `lib/social-utils.ts`

- `deriveActionFromShow(show)` — `"going" | "went"` baseado no `eventDateIso`
- `normalizeNameForSearch(input)` — lowercase + sem diacríticos + sem pontuação, usado na entrada do `/api/profiles/search` para casar com `display_name_normalized`
- `countAttendedShows(shows)` → `{ totalAttended, attendedThisYear }` — conta apenas shows passados (`!isFutureOrTodayShow`); `attendedThisYear` filtra por `yearFromEventDateIso === ano corrente`. Usado pelo `ProfileHeader` para o destaque de contagem de shows.

### `lib/supabase/social-helpers.ts`

Helpers server-only para rotas sociais:

- `loadAuthContext()` — `{ supabase, userId, configError }`
- `configErrorResponse()` / `unauthorizedResponse()` — atalhos de erro padronizado
- `fetchProfileSummary(supabase, userId)` — lê `profiles`
- `fetchProfileCounts(supabase, userId)` — duas queries `count: "exact", head: true` em paralelo
- `isViewerFollowing(supabase, viewerId, targetId)` — `false` quando viewerId === targetId
- `ensureCurrentProfile(supabase, userId, fallback)` — auto-cria profile se faltar

### `lib/auth.ts`

Helpers server-only de autenticação:

- `getServerUser()` — retorna `User | null`
- `requireServerUser()` — retorna `User` ou redireciona para `/login`
- `extractViewerProfile(user)` — extrai `{ id, name, avatarUrl }` do `User` Supabase

### `lib/wallet-storage.ts`

Lógica de wallet (client + server):

- `hydrateWalletFromServer()` — GET `/api/wallet`, merge com localStorage
- `saveToWalletServer(show)` — localStorage imediato + POST `/api/wallet`
- `removeFromWalletServer(showId)` — localStorage imediato + DELETE `/api/wallet`
- `flushPendingOperations()` — tenta reenviar operações em fila

### `lib/setlist-api.ts`

Cliente Setlist.fm (server-only):

- `searchSetlists(term, page)` — busca shows
- `getSetlistById(id)` — detalhe de um show

### `lib/setlist-cache.ts`

Cache in-memory (server-only):

- `getCacheValue<T>(key)` — retorna valor ou `null` se expirado
- `setCacheValue(key, value, ttlMs)` — armazena com TTL

### `lib/artist-image.ts` / `lib/artist-image-client.ts`

Resolução de imagem do artista em cascata: **MusicBrainz** (quando tem MBID) → **Deezer** (1ª opção por nome, cobertura ampla + imagem quadrada 1000×1000) → **Wikipedia/Wikidata** (fallback para clássicos/nicho, com filtro de contexto musical e checagem de título).

- `resolveArtistImage({ artistName, artistMbid })` — retorna `{ imageUrl, pageUrl, source }` (source ∈ `"wikipedia" | "wikimedia" | "deezer" | "none"`)
- Quando nenhuma fonte bate, devolve `source: "none"` em vez de retornar imagem errada.

### `lib/supabase/server.ts`

- `createSupabaseServerClient()` — cliente SSR com cookies

### `lib/supabase/client.ts`

- `getSupabaseBrowserClient()` — singleton do cliente browser

### `lib/supabase/shared.ts`

- `hasSupabaseEnv()` — verifica se `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` estão definidos
