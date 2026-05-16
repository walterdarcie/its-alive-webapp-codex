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
- Busca no MusicBrainz por `artistMbid` ou nome
- Fallback: Wikipedia → Wikimedia
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

### Curtir Post

1. Clique no coração → atualização otimística imediata no estado local
2. POST `/api/posts/{showId}/{postId}/like`
3. Toggle: insere ou remove de `post_likes`
4. Trigger PostgreSQL mantém `like_count` em `show_posts`
5. Se erro: reverte estado local

### Excluir Post

1. Ícone de lixeira aparece no hover do próprio post (`viewer.id === post.userId`)
2. Clique exibe confirmação inline: "Excluir? **Sim** / Não"
3. Confirmação: DELETE `/api/posts/{showId}/{postId}`
4. Post removido otimisticamente do estado local antes da resposta
5. Segurança dupla: query `.eq("user_id")` + RLS PostgreSQL

### Compartilhar Post

1. Clique no ícone de compartilhar
2. Tenta `navigator.share` (Web Share API — suporte mobile)
3. Fallback: `navigator.clipboard.writeText(window.location.href)`

---

## 6. Analytics (Google Analytics 4)

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
