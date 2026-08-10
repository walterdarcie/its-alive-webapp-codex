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
| Imagens | Deezer (principal) + MusicBrainz / Wikipedia / Wikidata (fallback) | Cascata com filtro de contexto musical |
| Setlists | Setlist.fm API | Cache in-memory 6h (search) / 24h (detail) |
| Shows futuros | Ticketmaster Discovery API v2 | Cache in-memory 1h; exige `TICKETMASTER_API_KEY` |
| Analytics | Google Analytics 4 (`G-LDQLEFB0DR`) | `trackEvent()` manual + page tracker |
| Deploy | Vercel (auto-deploy via push no `main`) | Branch `main` = produção |
| CI | GitHub Actions (Release Quality) | ESLint + Next.js build + Vitest a cada push/PR |
| Agendamentos | GitHub Actions (Supabase Keep-Alive) | Ping no Supabase a cada 3 dias para o projeto não pausar |

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
  │     ├─ /api/wallet               ← localStorage sync + Supabase
  │     ├─ /api/setlists/search      ← Setlist.fm + Ticketmaster (mergeados)
  │     ├─ /api/setlists/[id]        ← Setlist.fm detalhe (tm-* retorna 404 imediato)
  │     ├─ /api/artist-image         ← MusicBrainz → Deezer → Wikipedia/Wikidata
  │     ├─ /api/posts/*              ← Supabase show_posts + post_likes
  │     ├─ /api/profiles/me          ← perfil do viewer + ensure
  │     ├─ /api/profiles/[id]        ← perfil público + contadores
  │     ├─ /api/profiles/[id]/wallet ← wallet pública de outro usuário
  │     ├─ /api/profiles/[id]/follows← listagem de seguindo/seguidores
  │     ├─ /api/profiles/search      ← busca de amigos por nome
  │     ├─ /api/follows/[id]         ← POST seguir / DELETE deixar de seguir
  │     ├─ /api/feed/following       ← atividade dos seguidos
  │     ├─ /api/shows/trending       ← shows futuros com mais "Vai"
  │     └─ /api/auth/signout         ← Supabase signOut
  │
  └─► Supabase
        ├─ Auth (Google OAuth)
        ├─ DB: wallet_entries, show_posts, post_likes, profiles, user_follows, known_artists
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
| `TICKETMASTER_API_KEY` | Sim | lib/ticketmaster-api.ts |
| `BYPASS_AUTH` | Não | Bypassa auth em testes (`BYPASS_AUTH=1`) |
| `NEXT_PUBLIC_BYPASS_AUTH` | Não | Mesma coisa, lado cliente |

## Convenções de arquivos

```
app/
  globals.css                       ← TODOS os estilos aqui, sem exceção
  layout.tsx                        ← Root layout, fontes Work Sans (corpo) + Anton (títulos), GA
  page.tsx                          ← Server Component → chama HomeClient
  u/[userId]/page.tsx               ← Página de perfil de outro usuário
  u/[userId]/seguindo/page.tsx      ← Listagem de quem o user segue
  u/[userId]/seguidores/page.tsx    ← Listagem de quem segue o user
  ui/
    *-client.tsx                    ← Client Components ("use client")
    profile-header.tsx              ← Reuso entre home e perfil de outro
    social-drawer.tsx               ← Drawer lateral (home, search, perfil)
    follow-list-client.tsx          ← Listagem de seguindo/seguidores
  api/
    [recurso]/route.ts  ← Route Handlers Next.js
  [rota]/page.tsx       ← Server Components

lib/
  show-types.ts         ← Types compartilhados
  show-utils.ts         ← Helpers de formatação (sem efeitos colaterais)
  social-types.ts       ← Types do mundo social + formatPtBrNumber
  social-utils.ts       ← Helpers sociais (deriveActionFromShow, normalize…)
  auth.ts               ← Helpers de auth (server-only)
  wallet-storage.ts     ← Lógica de wallet (client + server)
  setlist-api.ts        ← Cliente Setlist.fm (server-only)
  ticketmaster-api.ts   ← Cliente Ticketmaster Discovery API (server-only)
  setlist-cache.ts      ← Cache in-memory (server-only)
  artist-image.ts       ← Resolução de imagem (server-only)
  artist-image-client.ts← Idem, para client components
  i18n.ts               ← Tipos Locale, LocaleDict e constantes i18n
  i18n-context.tsx      ← LocaleProvider + useLocale() hook ("use client")
  locales/
    pt.ts               ← Dicionário português (padrão)
    en.ts               ← Dicionário inglês
    es.ts               ← Dicionário espanhol
  supabase/
    shared.ts           ← Env helpers
    server.ts           ← SSR client factory
    client.ts           ← Browser client singleton
    social-helpers.ts   ← Helpers para endpoints sociais (server-only)

supabase/
  migrations/           ← SQL numerado por timestamp YYYYMMDDHHMMSS

scripts/
  itbi_green_space.py   ← Extração ITBI (standalone, ver abaixo)
  itbi_build_site.py    ← Gerador do site estático de ITBI (standalone)

itbi/
  green_space_tutoia.csv← Saída da extração (todas as colunas originais)
  index.html            ← Site estático autocontido, gerado pelo script
```

### Artefato standalone: consulta de ITBI (`itbi/`)

`itbi/` e os scripts `scripts/itbi_*.py` **não fazem parte do app Next.js** — não são
importados pelo build, não usam os tokens de `app/globals.css` e não sobem em nenhuma
rota da aplicação. É um artefato separado: uma página estática de consulta às transações
de ITBI do Edifício Green Space (R. Tutoia, 349), gerada offline a partir das planilhas
públicas da Prefeitura de São Paulo.

Pipeline (requer `pandas` + `openpyxl`; as planilhas anuais não são versionadas):

```bash
# 1. baixar os .xlsx anuais para um diretório qualquer (fonte:
#    https://prefeitura.sp.gov.br/web/fazenda/w/acesso_a_informacao/31501)
# 2. extrair as transações do imóvel
python3 scripts/itbi_green_space.py --input-dir <dir> --out itbi/green_space_tutoia.csv
# 3. gerar o HTML com os dados embutidos
python3 scripts/itbi_build_site.py --csv itbi/green_space_tutoia.csv --out itbi/index.html
```

O HTML é autocontido (CSS e dados inline, zero requisição de rede em runtime) e abre
direto pelo `file://`.

## Pipeline de CI (GitHub Actions)

Arquivo: `.github/workflows/release-quality.yml`  
Disparo: todo push em `main` e todo pull request (o job `search-live` só roda em push/`workflow_dispatch` — ver [docs/search.md](search.md)).

### Job 1 — Lint + Build + Unit

| Passo | Comando | Observação |
|---|---|---|
| Lint | `npm run lint` | ESLint 8 + `eslint-config-next@14` |
| Build | `npm run build` | `SETLISTFM_API_KEY=ci-placeholder` |
| Unit tests | `npm run test:unit` | Vitest 2 — arquivos em `tests/unit/` |

### Job 2 — E2E + Visual QA _(depende do Job 1)_

| Passo | Comando |
|---|---|
| E2E | `npm run test:e2e` |
| Visual QA | `npm run qa:visual` |

Artefatos do Playwright (relatório + screenshots) são retidos por 14 dias.

### Configuração do ESLint

- **Arquivo:** `.eslintrc.json` (formato legado, compatível com ESLint 8)
- **Config:** `"extends": "next/core-web-vitals"`
- **Versões:** `eslint@^8` + `eslint-config-next@^14.2.32` — devem ser mantidas em sincronia com a versão do Next.js
- ESLint 9 usa flat config e é **incompatível** com o `.eslintrc.json` — não atualizar sem migrar o config

## Workflow agendado — Supabase Keep-Alive

Arquivo: `.github/workflows/supabase-keepalive.yml`  
Disparo: `cron: "0 0 */3 * *"` (00:00 UTC a cada 3 dias) + `workflow_dispatch`.

O plano gratuito do Supabase pausa o projeto após ~7 dias sem atividade. O job faz
um `GET /rest/v1/wallet_entries?select=*&limit=1` com a anon key e falha (exit 1)
se não vier HTTP 200/206, com até 3 tentativas espaçadas por 10s.

| Detalhe | Valor |
|---|---|
| Secrets | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (os mesmos do job `search-live`) |
| Fallback | Valores públicos do projeto embutidos no workflow, caso os secrets não existam |
| `permissions` | `{}` — o job não precisa de nenhum escopo no repositório |

Pontos de atenção:

- **Use `select=*`, nunca uma coluna nomeada.** `wallet_entries` tem chave primária
  composta `(user_id, setlist_id)` e **não tem coluna `id`**. Um `select=id` retorna
  HTTP 400 (Postgres `42703`, `column wallet_entries.id does not exist`).
- **O corpo da resposta é impresso em caso de erro.** A versão anterior desse ping
  usava `curl -o /dev/null` e escondeu esse 400 por semanas.
- A leitura anônima funciona por causa da policy `wallet select public`
  (`using (true)`) — ver [docs/database.md](database.md).
- O cron roda a cada 3 dias contra uma janela de pausa de ~7 dias, então há folga
  para atrasos ou execuções puladas pelo GitHub.
- O GitHub **desativa workflows agendados após 60 dias sem commits no repositório**;
  avisa por e-mail e basta reativar pela aba Actions.
- Falhas do workflow já geram e-mail automático para o dono do repositório — não é
  preciso configurar notificação.

---

## Regras de produção

- **`app/globals.css` é sagrado** — todo CSS vai aqui. Nunca criar CSS Modules, Tailwind ou inline styles de layout.
- **Sem `default export` em componentes** — sempre `export function`.
- **Sem ícones de bibliotecas** — somente SVG inline com `fill="currentColor"`.
- **Server Components** para dados iniciais; **Client Components** para interatividade.
- **RLS sempre ativo** — nunca criar tabela sem habilitar `row level security`.
- **TypeScript sem erros** — `tsc --noEmit` deve passar antes de qualquer commit.
- **CI deve passar** — `npm run lint && npm run build && npm run test:unit` devem ser executados localmente antes de abrir PR.
