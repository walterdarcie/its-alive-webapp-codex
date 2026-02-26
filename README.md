# it's alive - webapp (codex)

MVP do webapp "it's alive" para buscar shows e montar carteira (`eu vou` / `eu fui`) com base na data do evento.

## Stack (base)
- Next.js (App Router)
- TypeScript
- Supabase (em breve)
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
2. Preencha `SETLISTFM_API_KEY` em `.env.local`
3. `npm install`
4. `npm run dev`
5. Abrir `http://localhost:3000`

## Fluxo MVP atual (sem login)
- Busca de shows via proxy interno (`/api/setlists/*`)
- Cache em memória para busca e detalhe
- Carteira local em `localStorage`
- Status derivado automaticamente da data:
  - futuro/hoje = `Eu vou`
  - passado = `Eu fui`

## Próximos passos
- Melhorar paginação e UX da busca
- Integração Supabase
- PWA
