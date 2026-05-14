create table if not exists public.show_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_display_name text not null,
  user_avatar_url text,
  show_id text not null,
  body text not null check (char_length(body) between 1 and 1000),
  photo_url text,
  like_count int not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists show_posts_show_id_created_idx
  on public.show_posts (show_id, created_at desc);

create table if not exists public.post_likes (
  post_id uuid not null references public.show_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (post_id, user_id)
);

create or replace function public.post_likes_update_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.show_posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.show_posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists post_likes_count_trigger on public.post_likes;
create trigger post_likes_count_trigger
after insert or delete on public.post_likes
for each row execute function public.post_likes_update_count();

alter table public.show_posts enable row level security;
alter table public.post_likes enable row level security;

drop policy if exists "show_posts select all" on public.show_posts;
create policy "show_posts select all" on public.show_posts for select using (true);

drop policy if exists "show_posts insert own" on public.show_posts;
create policy "show_posts insert own" on public.show_posts for insert with check (auth.uid() = user_id);

drop policy if exists "show_posts delete own" on public.show_posts;
create policy "show_posts delete own" on public.show_posts for delete using (auth.uid() = user_id);

drop policy if exists "post_likes select own" on public.post_likes;
create policy "post_likes select own" on public.post_likes for select using (auth.uid() = user_id);

drop policy if exists "post_likes insert own" on public.post_likes;
create policy "post_likes insert own" on public.post_likes for insert with check (auth.uid() = user_id);

drop policy if exists "post_likes delete own" on public.post_likes;
create policy "post_likes delete own" on public.post_likes for delete using (auth.uid() = user_id);

grant select on public.show_posts to anon, authenticated;
grant insert, delete on public.show_posts to authenticated;
grant select, insert, delete on public.post_likes to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-photos',
  'post-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

drop policy if exists "post_photos upload own" on storage.objects;
create policy "post_photos upload own" on storage.objects
  for insert with check (
    bucket_id = 'post-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "post_photos select all" on storage.objects;
create policy "post_photos select all" on storage.objects
  for select using (bucket_id = 'post-photos');
