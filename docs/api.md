# API Routes — it's alive

> Todos os endpoints são Next.js Route Handlers em `app/api/`. Retornam JSON. Erros sempre retornam `{ error: string, message?: string }`.

## Autenticação

A maioria dos endpoints protegidos chama `supabase.auth.getUser()` no servidor via cookie de sessão SSR. Endpoints que exigem login retornam `401` se o usuário não estiver autenticado.

---

## `/api/wallet`

Gerencia a wallet (shows salvos) do usuário autenticado.

### `GET /api/wallet`

Retorna todos os shows salvos do usuário.

**Auth:** Obrigatória.

**Response 200:**
```json
{
  "items": [
    {
      "show": { /* ShowRecord */ },
      "savedAt": "2026-05-14T12:00:00Z"
    }
  ]
}
```

### `POST /api/wallet`

Adiciona ou atualiza um show na wallet (upsert por `user_id + setlist_id`).

**Auth:** Obrigatória.

**Body:**
```json
{ "show": { /* ShowRecord */ } }
```

**Response 200:** mesmo formato do GET (wallet completa atualizada).

### `DELETE /api/wallet?showId={id}`

Remove um show da wallet.

**Auth:** Obrigatória.

**Query param:** `showId` (obrigatório).

**Response 200:** wallet completa atualizada.

---

## `/api/setlists/search`

### `GET /api/setlists/search?searchTerm={q}&p={page}`

Busca shows no Setlist.fm. Cache in-memory de 6h. O pipeline interno (parsing, resolução de MBID, fallbacks) está documentado em [docs/search.md](search.md).

**Auth:** Não.

**Query params:**
- `searchTerm` (obrigatório, mínimo 2 chars)
- `p` — página (default 0)

**Response 200:** payload do Setlist.fm mapeado para `ShowRecord[]`.

**Headers:** `Cache-Control: public, max-age=60, s-maxage=21600` + `x-cache: HIT|MISS`

**Erros:**
- `400` — searchTerm muito curto
- `429` — rate limit Setlist.fm
- `502` — erro na API externa

---

## `/api/setlists/[id]`

### `GET /api/setlists/{id}`

Carrega detalhes de um show específico. Cache 24h (com setlist) ou 5min (sem setlist).

**Auth:** Não.

**Response 200:** `ShowDetailRecord` (inclui `songNames`, `setlistSections`).

**Headers:** `Cache-Control` varia por conteúdo + `x-cache: HIT|MISS`

---

## `/api/artist-image`

### `GET /api/artist-image?artist={nome}&mbid={mbid}`

Resolve imagem do artista via MusicBrainz → Wikipedia/Wikimedia.

**Auth:** Não.

**Query params:** `artist` ou `mbid` (ao menos um obrigatório).

**Response 200:**
```json
{
  "imageUrl": "https://...",
  "pageUrl": "https://...",
  "source": "wikipedia" | "wikimedia"
}
```

**Headers:** `Cache-Control: public, max-age=3600, s-maxage=604800`

---

## `/api/posts/[showId]`

### `GET /api/posts/{showId}`

Lista os posts de um show (máximo 50, ordem decrescente por `created_at`).

**Auth:** Opcional. Se autenticado, `viewerLiked` reflete curtidas do viewer.

**Response 200:**
```json
{
  "posts": [
    {
      "id": "uuid",
      "userId": "uuid",
      "userDisplayName": "Nome",
      "userAvatarUrl": "https://...",
      "body": "Texto do post",
      "photoUrl": "https://..." | null,
      "likeCount": 3,
      "viewerLiked": false,
      "createdAt": "2026-05-14T12:00:00Z"
    }
  ]
}
```

### `POST /api/posts/{showId}`

Cria um novo post no feed do show.

**Auth:** Obrigatória.

**Body:**
```json
{
  "body": "Texto do post (1–1000 chars)",
  "photoUrl": "https://..." // opcional, URL já enviada ao Storage
}
```

**Response 201:** `{ "post": { /* Post */ } }`

**Validações:**
- `body` obrigatório e não vazio
- `body.length ≤ 1000`

---

## `/api/posts/[showId]/[postId]`

### `DELETE /api/posts/{showId}/{postId}`

Exclui um post. Dupla verificação: query `.eq("user_id")` + RLS.

**Auth:** Obrigatória. Apenas o autor pode excluir.

**Response 204:** sem corpo.

---

## `/api/posts/[showId]/[postId]/like`

### `POST /api/posts/{showId}/{postId}/like`

Alterna curtida (toggle). Insere ou remove de `post_likes`.

**Auth:** Obrigatória.

**Response 200:**
```json
{ "liked": true, "likeCount": 4 }
```

---

## `/api/auth/signout`

### `POST /api/auth/signout`

Encerra a sessão Supabase e retorna URL de redirect.

**Auth:** Não obrigatória (endpoint resiliente).

**Response 200:**
```json
{ "ok": true, "redirectTo": "https://itsalivememories.vercel.app/login" }
```
