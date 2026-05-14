# Componentes — it's alive

> Convenção: Server Components em `app/[rota]/page.tsx`; Client Components em `app/ui/*-client.tsx`. Nenhum `default export`.

## Árvore de componentes

```
RootLayout (app/layout.tsx) — Server
  ├── GoogleAnalytics (app/layout.tsx, inline)
  ├── app/page.tsx — Server
  │     └── HomeClient (app/ui/home-client.tsx) — Client
  │           └── ShowDetailClient (overlay) — Client
  │                 ├── ShowFeedClient — Client
  │                 └── (inline SVG icons)
  ├── app/search/page.tsx — Server
  │     └── SearchPageClient (app/ui/search-page-client.tsx) — Client
  │           └── ShowDetailClient (overlay) — Client
  │                 └── ShowFeedClient — Client
  ├── app/show/[id]/page.tsx — Server
  │     └── ShowDetailClient — Client
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

Página principal. Exibe wallet do usuário com tabs "Próximos" / "Histórico".

**Props:**
```ts
{ wallet: WalletPayload, viewer: Viewer }
```

**Estado:**
- `walletItems` — lista de shows salvos (sincronizada com servidor)
- `activeTab` — `"upcoming" | "history"`
- `overlayShow` — `ShowDetailRecord | null` (show aberto no overlay)
- `overlayLoading` — estado de carregamento do overlay

**Comportamento:**
- Hidrata wallet do servidor ao montar
- Sincroniza pendentes offline ao ganhar foco
- Abre `ShowDetailClient` em modo overlay ao clicar num card
- Propaga `viewer` para o overlay

---

### `SearchPageClient` — `app/ui/search-page-client.tsx`

Busca de shows. Input com debounce, paginação, abertura de overlay.

**Props:**
```ts
{ viewer: Viewer | null }
```

**Estado:**
- `searchTerm`, `results`, `loading`, `error`
- `page` — paginação
- `overlayShow` — show aberto no overlay

**Comportamento:**
- Debounce de 300ms no input
- Busca via `/api/setlists/search`
- Abre detalhe em overlay; propaga `viewer`

---

### `ShowDetailClient` — `app/ui/show-detail-client.tsx`

Detalhe completo de um show: header com imagem do artista, setlist, feed social.

**Props:**
```ts
{
  show: ShowDetailRecord;
  id: string;
  viewer?: Viewer | null;
  isOverlay?: boolean;        // default false
  onClose?: () => void;       // callback para fechar overlay
  onSaveToggle?: (show: ShowRecord, saved: boolean) => void;
}
```

**Estado:**
- `saved` — se o show está na wallet
- `artistImageUrl` — URL da foto do artista (lazy-loaded)
- `isClosing` — animação de saída do overlay

**Comportamento:**
- Botão de salvar/remover da wallet (otimístico)
- Carrega imagem do artista via `/api/artist-image`
- Renderiza `ShowFeedClient` abaixo do ticket de setlist
- Em overlay: fundo clicável fecha; `isClosing` dispara animação CSS

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

**Comportamento:**
- Carrega posts ao montar (cancela fetch se desmontado)
- Upload de foto: direto ao Supabase Storage via `getSupabaseBrowserClient()`
  - Caminho: `post-photos/{viewer.id}/{timestamp}-{random}.{ext}`
  - Limite: 10 MB, apenas imagens
- Envio de post: POST `/api/posts/{showId}` com `body` + `photoUrl?`
- Like toggle: POST `/api/posts/{showId}/{postId}/like` — atualização otimística imediata
- Delete: ícone visível no hover do próprio post → confirmação inline → DELETE `/api/posts/{showId}/{postId}`
- Compartilhar: Web Share API com fallback `navigator.clipboard`
- Usuário não autenticado vê o feed mas não pode postar

**Ícones internos (SVG inline):**
`HeartIcon`, `HeartFilledIcon`, `CommentIcon`, `ShareIcon`, `CameraIcon`, `CloseSmIcon`, `TrashIcon`

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

- `formatDate(isoDate)` — `"2025-12-31"` → `"31 de dezembro de 2025"`
- `formatPostDate(isoTimestamp)` — `"2025-12-31T..."` → `"31 dez 2025"`
- `deriveWalletStatus(isoDate)` — compara com hoje → `"going" | "went"`

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

Resolução de imagem do artista via MusicBrainz + Wikipedia/Wikimedia.

- `resolveArtistImage({ artistName, artistMbid })` — retorna `{ imageUrl, pageUrl, source }`

### `lib/supabase/server.ts`

- `createSupabaseServerClient()` — cliente SSR com cookies

### `lib/supabase/client.ts`

- `getSupabaseBrowserClient()` — singleton do cliente browser

### `lib/supabase/shared.ts`

- `hasSupabaseEnv()` — verifica se `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` estão definidos
