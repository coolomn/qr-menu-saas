-- Güvenlik bulgusu #6 (2026-11-14 denetimi): eski menu-images kovası.
--
-- Sorun: menu-images herkese açık (public) ve boyut/dosya türü sınırı yok. Eski
-- menu_imports_*_own_folder kuralları girişli HER kullanıcıya bu kovada
-- imports/{kendi-uid}/ altına yazma/okuma/silme izni veriyordu → Supabase alan
-- adımızdan herkese açık, sınırsız dosya (HTML, zararlı dosya) barındırma.
--
-- Uygulama artık yalnızca menu-public (resimler) ve menu-imports (özel, içe aktarma)
-- kovalarını kullanıyor; menu-images'a yazan/okuyan kod kaldırıldı.
--
-- İdempotent. Kova yoksa hiçbir şey yapmaz. Kovada dosya varsa herkese açık kalır
-- (mevcut resim bağlantıları kırılmasın), ama sınırlar yine uygulanır.

drop policy if exists menu_imports_insert_own_folder on storage.objects;
drop policy if exists menu_imports_select_own_folder on storage.objects;
drop policy if exists menu_imports_delete_own_folder on storage.objects;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
where id = 'menu-images';

update storage.buckets b
set public = false
where b.id = 'menu-images'
  and not exists (select 1 from storage.objects o where o.bucket_id = 'menu-images');

-- Geri alma (önerilmez):
-- update storage.buckets set public = true, file_size_limit = null, allowed_mime_types = null
--   where id = 'menu-images';
-- create policy menu_imports_insert_own_folder on storage.objects for insert to authenticated
--   with check (bucket_id = 'menu-images' and name like 'imports/' || auth.uid()::text || '/%');
-- create policy menu_imports_select_own_folder on storage.objects for select to authenticated
--   using (bucket_id = 'menu-images' and name like 'imports/' || auth.uid()::text || '/%');
-- create policy menu_imports_delete_own_folder on storage.objects for delete to authenticated
--   using (bucket_id = 'menu-images' and name like 'imports/' || auth.uid()::text || '/%');
