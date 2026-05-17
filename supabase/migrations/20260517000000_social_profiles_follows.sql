-- Profiles: espelho consultável de auth.users com display_name e avatar.
-- Necessário para buscar amigos e exibir contadores SEGUINDO/SEGUIDORES.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  display_name_normalized text not null,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists profiles_display_name_normalized_idx
  on public.profiles (display_name_normalized text_pattern_ops);

create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (display_name_normalized gin_trgm_ops);

alter table public.profiles enable row level security;

drop policy if exists "profiles select all" on public.profiles;
create policy "profiles select all"
  on public.profiles
  for select
  using (true);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

create or replace function public.profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at_trigger on public.profiles;
create trigger profiles_set_updated_at_trigger
before update on public.profiles
for each row
execute function public.profiles_set_updated_at();

-- Função utilitária para normalizar nome (lowercase + sem diacríticos).
create or replace function public.normalize_display_name(input text)
returns text
language sql
immutable
as $$
  select lower(
    translate(
      coalesce(input, ''),
      'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
      'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
    )
  )
$$;

-- Trigger que mantém profiles em sync com auth.users.
create or replace function public.handle_auth_user_profile_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_avatar text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Fã de shows'
  );
  v_avatar := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
  );

  insert into public.profiles (user_id, display_name, display_name_normalized, avatar_url)
  values (new.id, v_name, public.normalize_display_name(v_name), v_avatar)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        display_name_normalized = excluded.display_name_normalized,
        avatar_url = excluded.avatar_url,
        updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
after insert or update of email, raw_user_meta_data on auth.users
for each row
execute function public.handle_auth_user_profile_sync();

-- Backfill: garante profile para usuários já existentes.
insert into public.profiles (user_id, display_name, display_name_normalized, avatar_url)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Fã de shows'
  ) as display_name,
  public.normalize_display_name(
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Fã de shows'
    )
  ) as display_name_normalized,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'picture'), '')
  ) as avatar_url
from auth.users u
on conflict (user_id) do nothing;

-- user_follows: pares (seguidor, seguido).
create table if not exists public.user_follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists user_follows_follower_idx
  on public.user_follows (follower_id, created_at desc);

create index if not exists user_follows_following_idx
  on public.user_follows (following_id, created_at desc);

alter table public.user_follows enable row level security;

drop policy if exists "user_follows select all" on public.user_follows;
create policy "user_follows select all"
  on public.user_follows
  for select
  using (true);

drop policy if exists "user_follows insert own" on public.user_follows;
create policy "user_follows insert own"
  on public.user_follows
  for insert
  with check (auth.uid() = follower_id);

drop policy if exists "user_follows delete own" on public.user_follows;
create policy "user_follows delete own"
  on public.user_follows
  for delete
  using (auth.uid() = follower_id);

grant select on public.user_follows to anon, authenticated;
grant insert, delete on public.user_follows to authenticated;
