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

**RLS:**
- SELECT: público (anon + authenticated) — necessário para o feed social "Seguindo", trending da plataforma e página `/u/[userId]`. Wallet entries são consideradas dados de "diário público de shows".
- INSERT / UPDATE / DELETE: apenas pelo próprio `user_id`.

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

---

### `profiles`

Espelho consultável de `auth.users` com nome de exibição e avatar. Necessário para a busca de amigos e a exibição de contadores SEGUINDO/SEGUIDORES sem expor a tabela de auth.

| Coluna | Tipo | Restrições |
|---|---|---|
| `user_id` | `uuid` | PK — FK → `auth.users.id` ON DELETE CASCADE |
| `display_name` | `text` | Nome derivado de `full_name`/`name` do metadata Google ou parte antes do `@` no e-mail |
| `display_name_normalized` | `text` | lowercase + sem diacríticos — usado pela busca de amigos |
| `avatar_url` | `text` | Nullable, espelha `avatar_url`/`picture` do metadata |
| `created_at` | `timestamptz` | UTC |
| `updated_at` | `timestamptz` | UTC, atualizado por trigger |

**Índices:**
- `profiles_display_name_normalized_idx` ON `(display_name_normalized text_pattern_ops)` — lookup exato e LIKE `'prefix%'`
- `profiles_display_name_trgm_idx` USING GIN `(display_name_normalized gin_trgm_ops)` — busca por similaridade futura

**Triggers:**
- `profiles_set_updated_at_trigger` — antes de UPDATE, atualiza `updated_at`
- `on_auth_user_profile_sync` em `auth.users` — após INSERT ou UPDATE de `email`/`raw_user_meta_data`, faz upsert em `profiles` via `handle_auth_user_profile_sync()`

**RLS:**
- SELECT: público (anon + authenticated)
- INSERT: `auth.uid() = user_id`
- UPDATE: `auth.uid() = user_id`

**Backfill:** a migration popula `profiles` para todos os `auth.users` já existentes na primeira aplicação.

---

### `user_follows`

Pares (seguidor, seguido) que constituem o grafo social.

| Coluna | Tipo | Restrições |
|---|---|---|
| `follower_id` | `uuid` | FK → `auth.users.id` ON DELETE CASCADE |
| `following_id` | `uuid` | FK → `auth.users.id` ON DELETE CASCADE |
| `created_at` | `timestamptz` | UTC |

**Primary key:** `(follower_id, following_id)`  
**Check:** `follower_id <> following_id` (ninguém segue a si mesmo)

**Índices:**
- `user_follows_follower_idx` ON `(follower_id, created_at DESC)`
- `user_follows_following_idx` ON `(following_id, created_at DESC)`

**RLS:**
- SELECT: público (anon + authenticated) — contadores são públicos
- INSERT: `auth.uid() = follower_id`
- DELETE: `auth.uid() = follower_id`

---

### `known_artists`

Cache de artistas do MusicBrainz usado para resolução de MBID sem chamar `setlist.fm /search/artists`.

| Coluna | Tipo | Restrições |
|---|---|---|
| `mbid` | `text` | PK — MusicBrainz ID |
| `canonical_name` | `text` | Nome oficial do artista |
| `name_normalized` | `text` | lowercase, sem diacríticos, sem apóstrofos |

**Índices:**
- `known_artists_name_prefix_idx` ON `(name_normalized text_pattern_ops)` — lookup exato e LIKE 'prefix%'
- `known_artists_trgm_idx` USING GIN `(name_normalized gin_trgm_ops)` — similaridade/autocomplete futuro

**RLS:** SELECT público (`USING (true)`). Escrita apenas via service role key (script de importação).

**Populado por:** `scripts/import-musicbrainz-artists.ts` (dump do MusicBrainz, ~3M artistas).
Ver `docs/search.md` para instruções de importação.

---

## Migrações

| Arquivo | O que faz |
|---|---|
| `20260228161000_wallet_entries.sql` | Cria `wallet_entries`, índice, trigger de `updated_at`, RLS |
| `20260514120000_show_posts.sql` | Cria `show_posts`, `post_likes`, trigger de `like_count`, RLS, bucket `post-photos` |
| `20260515000000_known_artists.sql` | Cria `known_artists`, extensão `pg_trgm`, índices B-tree e trigrama, RLS pública, seed com 23 artistas |
| `20260517000000_social_profiles_follows.sql` | Cria `profiles` (com trigger de sync a `auth.users` + backfill) e `user_follows` (com check `follower_id <> following_id`), `normalize_display_name(text)` SQL function, índices B-tree e trigrama em `display_name_normalized`, RLS públicas para SELECT |
| `20260518120000_wallet_entries_public_select.sql` | Substitui a policy `wallet select own` por `wallet select public` (`using (true)`) e concede `select` a `anon`. Necessário para o feed social, trending e perfis públicos lerem a carteirinha de quem o viewer não é dono. INSERT/UPDATE/DELETE seguem restritos ao próprio dono. O workflow `supabase-keepalive.yml` também depende dessa policy — reverter para `wallet select own` quebra o ping agendado. |
| `20260518150000_wallet_reset_artist_image.sql` | Limpa `artistImageUrl`/`artistImagePageUrl`/`artistImageSource` do JSONB `show_data` das linhas com fonte antiga (não-Deezer). **Desabilita o trigger de `updated_at`** durante o UPDATE para preservar a ordem do feed "Seguindo". A UI re-resolve as imagens via `/api/artist-image` (cascata MusicBrainz → Deezer → Wikipedia) no próximo load. |

As migrations são idempotentes (`create table if not exists`, `drop trigger if exists`, `drop policy if exists`).

> **Como aplicar:** via Supabase Management API (`POST /v1/projects/{ref}/database/query`) — `db push` requer senha do DB que não está no `.env.local`.

---

## Funções PostgreSQL

### `handle_auth_user_profile_sync()`

```sql
-- Trigger AFTER INSERT OR UPDATE em auth.users.
-- Upsert em public.profiles com display_name, display_name_normalized
-- e avatar_url derivados de raw_user_meta_data + email.
-- security definer (escreve em public.profiles sem RLS do caller).
```

### `normalize_display_name(text)`

```sql
-- Função SQL imutável usada pelo trigger de sync.
-- Aplica lower() + translate() para remover diacríticos comuns
-- (Portuguese/Spanish coverage). Sem extensão "unaccent".
```

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
