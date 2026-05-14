# Arquitetura — it's alive

> Contexto rápido para LLMs: projeto Next.js 14 App Router, dark-mode only, pt-BR, sem CSS framework, sem component library.

## Stack

| Camada | Tecnologia | Observação |
|---|---|---|
| Framework | Next.js 14 (App Router) | Server Components + Client Components |
| Linguagem | TypeScript 5.6 strict | `noEmit` sem erros é pré-requisito de deploy |
| Estilo | Vanilla CSS (`app/globals.css`) | Tokens CSS, zero Tailwind/Modules/CSS-in-JS |
| Banco | Supabase (PostgreSQL) | RLS ativado em todas as tabelas |
| Auth | Supabase Auth (Google OAuth) | Cookies SSR via `@supabase/ssr` |
| Storage | Supabase Storage | Bucket `post-photos` para fotos de posts |
| Imagens | Wikipedia / Wikimedia via MusicBrainz | Fallback automático para artistas |
| Setlists | Setlist.fm API | Cache in-memory 6h (search) / 24h (detail) |
| Analytics | Google Analytics 4 (`G-LDQLEFB0DR`) | `trackEvent()` manual + page tracker |
| Deploy | Vercel (auto-deploy via push no `main`) | Branch `main` = produção |
| CI | TypeScript + Vitest | Rodam local; Vercel faz o build check |

## Diagrama de sistema

```
Browser
  │
  ├─► Vercel Edge (middleware.ts)
  │     └─ Refreshes Supabase session cookie em toda request
  │
  ├─► Next.js Server Components (SSR)
  │     ├─ app/page.tsx         → requireServerUser() → HomeClient
  │     ├─ app/show/[id]/page.tsx → getSetlistById + getServerUser
  │     ├─ app/search/page.tsx  → getServerUser
  │     └─ app/login, signin    → redirect se já autenticado
  │
  ├─► API Routes (Next.js Route Handlers)
  │     ├─ /api/wallet          ← localStorage sync + Supabase
  │     ├─ /api/setlists/*      ← Setlist.fm (SETLISTFM_API_KEY)
  │     ├─ /api/artist-image    ← MusicBrainz + Wikipedia
  │     ├─ /api/posts/*         ← Supabase show_posts + post_likes
  │     └─ /api/auth/signout    ← Supabase signOut
  │
  └─► Supabase
        ├─ Auth (Google OAuth)
        ├─ DB: wallet_entries, show_posts, post_likes
        └─ Storage: post-photos (público)
```

## Fluxo de autenticação

```
/login ou /signin
  → "Entrar com Google"
  → supabase.auth.signInWithOAuth({ provider: "google", redirectTo: "/auth/callback" })
  → /auth/callback?code=xxx&next=/
  → exchangeCodeForSession()
  → redirect para next (sanitizado, só caminhos internos)

Middleware em toda request:
  → createSupabaseServerClient()
  → supabase.auth.getUser()
  → atualiza cookies se expirado
```

## Fluxo de wallet (shows salvos)

```
Client (localStorage) ←→ Server (Supabase)

1. Hidratação inicial: hydrateWalletFromServer()
   → GET /api/wallet → merge com localStorage

2. Salvar show: saveToWalletServer(show)
   → localStorage imediato (otimístico)
   → POST /api/wallet
   → Se falhar: enfileira operação pendente

3. Sync pendentes: tentativa a cada hydratação
4. Evento "focus": re-sincroniza com servidor
5. Evento "storage": re-lê localStorage (multi-aba)
```

## Fluxo de posts (feed social)

```
ShowFeedClient monta → GET /api/posts/[showId]
  → show_posts (últimos 50)
  → post_likes WHERE user_id = viewer (para viewerLiked)

Novo post:
  1. Foto (opcional) → upload direto p/ Supabase Storage (browser client)
     Caminho: post-photos/{userId}/{timestamp}-{random}.ext
  2. POST /api/posts/[showId] { body, photoUrl? }
  3. Insere em show_posts (user_display_name e user_avatar_url denormalizados)

Curtida:
  POST /api/posts/[showId]/[postId]/like
  → toggle insert/delete em post_likes
  → trigger atualiza like_count em show_posts

Excluir:
  DELETE /api/posts/[showId]/[postId]
  → .delete().eq("id").eq("user_id") — dupla verificação + RLS
```

## Variáveis de ambiente

| Variável | Obrigatória | Onde usada |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | middleware, lib/supabase/* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | middleware, lib/supabase/* |
| `SUPABASE_SERVICE_ROLE_KEY` | Não (futuro) | Não usado ainda |
| `SETLISTFM_API_KEY` | Sim | lib/setlist-api.ts |
| `BYPASS_AUTH` | Não | Bypassa auth em testes (`BYPASS_AUTH=1`) |
| `NEXT_PUBLIC_BYPASS_AUTH` | Não | Mesma coisa, lado cliente |

## Convenções de arquivos

```
app/
  globals.css           ← TODOS os estilos aqui, sem exceção
  layout.tsx            ← Root layout, fonte Work Sans, GA
  page.tsx              ← Server Component → chama HomeClient
  ui/
    *-client.tsx        ← Client Components ("use client")
  api/
    [recurso]/route.ts  ← Route Handlers Next.js
  [rota]/page.tsx       ← Server Components

lib/
  show-types.ts         ← Types compartilhados
  show-utils.ts         ← Helpers de formatação (sem efeitos colaterais)
  auth.ts               ← Helpers de auth (server-only)
  wallet-storage.ts     ← Lógica de wallet (client + server)
  setlist-api.ts        ← Cliente Setlist.fm (server-only)
  setlist-cache.ts      ← Cache in-memory (server-only)
  artist-image.ts       ← Resolução de imagem (server-only)
  artist-image-client.ts← Idem, para client components
  supabase/
    shared.ts           ← Env helpers
    server.ts           ← SSR client factory
    client.ts           ← Browser client singleton

supabase/
  migrations/           ← SQL numerado por timestamp YYYYMMDDHHMMSS
```

## Regras de produção

- **`app/globals.css` é sagrado** — todo CSS vai aqui. Nunca criar CSS Modules, Tailwind ou inline styles de layout.
- **Sem `default export` em componentes** — sempre `export function`.
- **Sem ícones de bibliotecas** — somente SVG inline com `fill="currentColor"`.
- **Server Components** para dados iniciais; **Client Components** para interatividade.
- **RLS sempre ativo** — nunca criar tabela sem habilitar `row level security`.
- **TypeScript sem erros** — `tsc --noEmit` deve passar antes de qualquer commit.
