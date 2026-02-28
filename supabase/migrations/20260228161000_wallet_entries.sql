create table if not exists public.wallet_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  setlist_id text not null,
  event_date date not null,
  status text not null check (status in ('going', 'went')),
  show_data jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, setlist_id)
);

create index if not exists wallet_entries_user_event_idx
  on public.wallet_entries (user_id, event_date desc);

create or replace function public.wallet_entries_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists wallet_entries_set_updated_at_trigger on public.wallet_entries;
create trigger wallet_entries_set_updated_at_trigger
before update on public.wallet_entries
for each row
execute function public.wallet_entries_set_updated_at();

alter table public.wallet_entries enable row level security;

drop policy if exists "wallet select own" on public.wallet_entries;
create policy "wallet select own"
on public.wallet_entries
for select
using (auth.uid() = user_id);

drop policy if exists "wallet insert own" on public.wallet_entries;
create policy "wallet insert own"
on public.wallet_entries
for insert
with check (auth.uid() = user_id);

drop policy if exists "wallet update own" on public.wallet_entries;
create policy "wallet update own"
on public.wallet_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "wallet delete own" on public.wallet_entries;
create policy "wallet delete own"
on public.wallet_entries
for delete
using (auth.uid() = user_id);

grant select, insert, update, delete on public.wallet_entries to authenticated;
