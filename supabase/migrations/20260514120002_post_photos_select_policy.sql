drop policy if exists "post_photos select all" on storage.objects;

create policy "post_photos select own" on storage.objects
  for select using (
    bucket_id = 'post-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
