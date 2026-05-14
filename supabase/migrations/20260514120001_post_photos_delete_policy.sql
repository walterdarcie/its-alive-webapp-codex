drop policy if exists "post_photos delete own" on storage.objects;
create policy "post_photos delete own" on storage.objects
  for delete using (
    bucket_id = 'post-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
