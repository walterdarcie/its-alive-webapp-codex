# it's alive - webapp (codex)

MVP do webapp "it's alive" para buscar shows e montar carteira (`eu vou` / `eu fui`) com base na data do evento.

## Stack (base)
- Next.js (App Router)
- TypeScript
- Supabase (Auth + Postgres + RLS)
- Vercel (deploy)

## MVP (V1)
- Buscar shows
- Ver detalhes
- Marcar/desmarcar show na carteira
- Home com:
  - slider de shows futuros (`eu vou`)
  - lista de shows passados (`eu fui`)

## Como rodar localmente
1. `cp .env.example .env.local`
2. Preencha no `.env.local`:
   - `SETLISTFM_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `npm install`
4. `npm run dev`
5. Abrir `http://localhost:3000`

## Supabase (release 0.2)
### 1) Banco
- Execute a migration `supabase/migrations/20260228161000_wallet_entries.sql` no SQL Editor do projeto Supabase.
- A tabela `wallet_entries` guarda a carteira por usuário e usa RLS para isolar dados por `auth.uid()`.

### 2) Auth Google
- No Supabase:
  - Authentication -> Providers -> Google -> habilitar.
  - Adicionar Client ID/Secret do Google OAuth.
- URLs de callback:
  - Local: `http://localhost:3000/auth/callback`
  - Produção: `https://its-alive-webapp-codex.vercel.app/auth/callback`
- Defina em Authentication -> URL Configuration:
  - Site URL: `https://its-alive-webapp-codex.vercel.app`
  - Redirect URLs: incluir local e produção.

### 3) Fluxo
- Usuário não autenticado é redirecionado para `/login`.
- Login Google usa Supabase OAuth e retorna para `/auth/callback`.
- Carteira sincroniza no backend via `/api/wallet`.

## QA visual (Playwright)
- Rodar QA visual com capturas e checks de layout: `npm run qa:visual`
- Atualizar snapshots após mudança intencional de UI: `npm run qa:visual:update`
- Cobertura atual:
  - Home
  - Search
  - Detail overlay
  - Viewports mobile e desktop

## Testes automatizados
- Unitários (Vitest): `npm run test:unit`
- E2E de fluxo MVP (Playwright): `npm run test:e2e`
- Visual QA (Playwright): `npm run qa:visual`

## CI (GitHub Actions)
- Workflow principal: `.github/workflows/release-quality.yml`
- Executa em push/PR:
  - lint
  - build
  - testes unitários
  - testes E2E
  - QA visual com upload de artefatos

## Fluxo MVP atual
- Busca de shows via proxy interno (`/api/setlists/*`)
- Cache em memória para busca e detalhe
- Login Google com Supabase
- Carteira persistida no Supabase + fallback local em `localStorage`
- Status derivado automaticamente da data:
  - futuro/hoje = `Eu vou`
  - passado = `Eu fui`

## Próximos passos
- Melhorar paginação e UX da busca
- feed social (comentários/fotos/vídeos)
- PWA
