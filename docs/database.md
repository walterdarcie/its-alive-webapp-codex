# Database — it's alive

> Supabase (PostgreSQL). RLS habilitado em todas as tabelas. Migrations numeradas por timestamp `YYYYMMDDHHMMSS` em `supabase/migrations/`.

## Tabelas

### `wallet_entries`

Guarda os shows salvos de cada usuário (wallet/carteirinha).

| Coluna | Tipo | Restrições |
|---|---|---|
| `user_id` | `uuid` | FK → `auth.users.id` ON DELETE CASCADE |
| `setlist_id` | `text` | ID do show no Setlist.fm |
| `event_date` | `date` | Data do show (YYYY-MM-DD) |
| `status` | `text` | `'going'` (futuro) ou `'went'` (passado) |
| `show_data` | `jsonb` | Snapshot do `ShowRecord` completo |
| `created_at` | `timestamptz` | UTC, default `now()` |
| `updated_at` | `timestamptz` | UTC, atualizado por trigger |

**Primary key:** `(user_id, setlist_id)`

**Índices:**
- `wallet_entries_user_event_idx` ON `(user_id, event_date DESC)`

**Triggers:**
- `wallet_entries_set_updated_at_trigger` — atualiza `updated_at` em todo UPDATE

**RLS:** SELECT / INSERT / UPDATE / DELETE apenas pelo próprio `user_id`.

---

### `show_posts`

Feed social: posts de usuários em um show específico.

| Coluna | Tipo | Restrições |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `user_id` | `uuid` | FK → `auth.users.id` ON DELETE CASCADE |
| `user_display_name` | `text` | Desnormalizado do perfil Google |
| `user_avatar_url` | `text` | Desnormalizado do perfil Google (nullable) |
| `show_id` | `text` | ID do show no Setlist.fm |
| `body` | `text` | CHECK: 1–1000 caracteres |
| `photo_url` | `text` | URL pública no Supabase Storage (nullable) |
| `like_count` | `int` | Mantido por trigger (default 0) |
| `created_at` | `timestamptz` | UTC, default `now()` |

**Índices:**
- `show_posts_show_id_created_idx` ON `(show_id, created_at DESC)`

**Triggers:**
- `post_likes_count_trigger` — incrementa/decrementa `like_count` após INSERT/DELETE em `post_likes`

**RLS:**
- SELECT: público (anon + authenticated)
- INSERT: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

---

### `post_likes`

Registro de curtidas. Cada par `(post_id, user_id)` é único.

| Coluna | Tipo | Restrições |
|---|---|---|
| `post_id` | `uuid` | FK → `show_posts.id` ON DELETE CASCADE |
| `user_id` | `uuid` | FK → `auth.users.id` ON DELETE CASCADE |

**Primary key:** `(post_id, user_id)`

**RLS:** SELECT / INSERT / DELETE apenas pelo próprio `user_id`.

---

## Storage

### Bucket `post-photos`

| Propriedade | Valor |
|---|---|
| Visibilidade | Público |
| Tamanho máximo | 10 MB |
| MIME types aceitos | `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif` |

**Caminho de upload:** `post-photos/{userId}/{timestamp}-{random}.{ext}`

**Storage policies:**
- `post_photos upload own` — INSERT se `(storage.foldername(name))[1] = auth.uid()::text`
- `post_photos select all` — SELECT público

---

## Migrações

| Arquivo | O que faz |
|---|---|
| `20260228161000_wallet_entries.sql` | Cria `wallet_entries`, índice, trigger de `updated_at`, RLS |
| `20260514120000_show_posts.sql` | Cria `show_posts`, `post_likes`, trigger de `like_count`, RLS, bucket `post-photos` |

As migrations são idempotentes (`create table if not exists`, `drop trigger if exists`, `drop policy if exists`).

> **Como aplicar:** via Supabase Management API (`POST /v1/projects/{ref}/database/query`) — `db push` requer senha do DB que não está no `.env.local`.

---

## Funções PostgreSQL

### `post_likes_update_count()`

```sql
-- Chamada pelo trigger após INSERT ou DELETE em post_likes
-- Incrementa ou decrementa like_count em show_posts
```

### `wallet_entries_set_updated_at()`

```sql
-- Chamada pelo trigger antes de UPDATE em wallet_entries
-- Define new.updated_at = now()
```
