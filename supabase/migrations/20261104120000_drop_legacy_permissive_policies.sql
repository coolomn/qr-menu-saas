-- Eski (dashboard'dan elle açılmış) gevşek RLS policy'lerini kaldırır (Faz 0).
--
-- Bu policy'ler yalnızca production'da vardı, migration geçmişinde yoktu.
-- Postgres'te PERMISSIVE policy'ler OR ile birleşir; bu yüzden 20261103120000
-- tek başına production'ı korumuyordu.
--
-- Kaldırılanlar ve riskleri:
--   restaurants "Public can view restaurants"  SELECT true (rol: public)
--     -> anon key ile tüm restoranların login_username, owner_id, tenant_status,
--        subscription_ends_at alanları okunabiliyordu.
--   categories / products "Public can view ..." SELECT true
--     -> pasif ürünler dahil tüm tenant verisi anon okunabiliyordu.
--   restaurants "Owner can manage their restaurant" ALL (auth.uid() = owner_id)
--     -> owner kendi adına yeni restoran açabiliyor / restoranını silebiliyordu.
--   categories "Owner can manage categories" ALL
--     -> categories_owner_* ile aynı kapsam; yinelenen ve DELETE/INSERT'i geniş tutan kural.
--   products "Owner can manage products" ALL
--     -> yalnızca category_id kontrol ediliyordu, restaurant_id değil:
--        owner başka restoranın menüsüne ürün yazabiliyordu.
--   storage.objects "Resim_Yukleme" INSERT / "Resimleri_Gorme" SELECT (bucket menu-images, rol: public)
--     -> giriş yapmamış biri herkese açık menu-images bucket'ına dosya yükleyebiliyordu.
--        Bucket kullanılmıyor (0 dosya); bucket'ın kendisi bu migration'da silinmez.
--
-- Etkisi olmaması beklenen yerler:
--   Public menü (/menu/{slug}, /api/public-menu/*) service role ile okur; bu policy'lere ihtiyaç duymaz.
--   Admin panel owner olarak *_owner_select/insert/update/delete policy'lerini kullanır (dokunulmuyor).
--
-- GERİ ALMA (gerekirse, production'daki orijinal tanımlar):
--   create policy "Public can view restaurants" on public.restaurants for select to public using (true);
--   create policy "Public can view categories"  on public.categories  for select to public using (true);
--   create policy "Public can view products"    on public.products    for select to public using (true);
--   create policy "Owner can manage their restaurant" on public.restaurants for all to public
--     using (auth.uid() = owner_id);
--   create policy "Owner can manage categories" on public.categories for all to public
--     using (restaurant_id in (select restaurants.id from public.restaurants where restaurants.owner_id = auth.uid()));
--   create policy "Owner can manage products" on public.products for all to public
--     using (category_id in (select categories.id from public.categories where categories.restaurant_id in
--       (select restaurants.id from public.restaurants where restaurants.owner_id = auth.uid())));
--   create policy "Resim_Yukleme"   on storage.objects for insert to public with check (bucket_id = 'menu-images');
--   create policy "Resimleri_Gorme" on storage.objects for select to public using (bucket_id = 'menu-images');

drop policy if exists "Public can view restaurants" on public.restaurants;
drop policy if exists "Public can view categories" on public.categories;
drop policy if exists "Public can view products" on public.products;

drop policy if exists "Owner can manage their restaurant" on public.restaurants;
drop policy if exists "Owner can manage categories" on public.categories;
drop policy if exists "Owner can manage products" on public.products;

drop policy if exists "Resim_Yukleme" on storage.objects;
drop policy if exists "Resimleri_Gorme" on storage.objects;
