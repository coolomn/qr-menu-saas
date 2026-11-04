-- Aboneliği bitmiş / askıya alınmış restoranların sahipleri veritabanına doğrudan
-- (tarayıcıdaki Supabase istemcisiyle) yazamasın. Panelde kilit ekranı var; bu, aynı kuralın
-- veritabanı tarafı.
--
-- Yöntem: mevcut izin politikalarına dokunmadan her tabloya RESTRICTIVE (AND'lenen)
-- INSERT/UPDATE/DELETE politikaları eklenir. SELECT etkilenmez (kilit ekranı restoranı okuyabilmeli).
-- service_role RLS'i zaten atlar (API route'ları kendi requireActiveOwnedRestaurant kontrolüne sahip).
-- Platform admin (master panel) her zaman yazabilir.
--
-- Kural, uygulamadaki isPublicMenuBlocked ile aynı:
--   tenant_status 'suspended' / 'expired' ise ya da subscription_ends_at geçmişteyse kilitli.

create or replace function public.restaurant_write_allowed(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.restaurants r
      where r.id = rid
        and lower(coalesce(r.tenant_status, 'active')) not in ('suspended', 'expired')
        and (r.subscription_ends_at is null or r.subscription_ends_at >= now())
    );
$$;

revoke all on function public.restaurant_write_allowed(uuid) from public;
grant execute on function public.restaurant_write_allowed(uuid) to authenticated;

-- restaurants (sahip yalnızca UPDATE yapabiliyor)
drop policy if exists restaurants_active_tenant_update on public.restaurants;
create policy restaurants_active_tenant_update on public.restaurants
  as restrictive for update to authenticated
  using (public.restaurant_write_allowed(id))
  with check (public.restaurant_write_allowed(id));

-- restaurant_id kolonu olan tablolar
do $$
declare
  t text;
begin
  foreach t in array array['categories', 'menu_collections', 'products', 'product_variants']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_active_tenant_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_active_tenant_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_active_tenant_delete', t);

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated
         with check (public.restaurant_write_allowed(restaurant_id))',
      t || '_active_tenant_insert', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated
         using (public.restaurant_write_allowed(restaurant_id))
         with check (public.restaurant_write_allowed(restaurant_id))',
      t || '_active_tenant_update', t);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated
         using (public.restaurant_write_allowed(restaurant_id))',
      t || '_active_tenant_delete', t);
  end loop;
end $$;

-- Bağlantı tabloları (restaurant_id yok; kategori / ürün üzerinden)
drop policy if exists category_menu_collections_active_tenant_insert on public.category_menu_collections;
drop policy if exists category_menu_collections_active_tenant_update on public.category_menu_collections;
drop policy if exists category_menu_collections_active_tenant_delete on public.category_menu_collections;
create policy category_menu_collections_active_tenant_insert on public.category_menu_collections
  as restrictive for insert to authenticated
  with check (public.restaurant_write_allowed((select c.restaurant_id from public.categories c where c.id = category_id)));
create policy category_menu_collections_active_tenant_update on public.category_menu_collections
  as restrictive for update to authenticated
  using (public.restaurant_write_allowed((select c.restaurant_id from public.categories c where c.id = category_id)))
  with check (public.restaurant_write_allowed((select c.restaurant_id from public.categories c where c.id = category_id)));
create policy category_menu_collections_active_tenant_delete on public.category_menu_collections
  as restrictive for delete to authenticated
  using (public.restaurant_write_allowed((select c.restaurant_id from public.categories c where c.id = category_id)));

drop policy if exists product_menu_collections_active_tenant_insert on public.product_menu_collections;
drop policy if exists product_menu_collections_active_tenant_update on public.product_menu_collections;
drop policy if exists product_menu_collections_active_tenant_delete on public.product_menu_collections;
create policy product_menu_collections_active_tenant_insert on public.product_menu_collections
  as restrictive for insert to authenticated
  with check (public.restaurant_write_allowed((select p.restaurant_id from public.products p where p.id = product_id)));
create policy product_menu_collections_active_tenant_update on public.product_menu_collections
  as restrictive for update to authenticated
  using (public.restaurant_write_allowed((select p.restaurant_id from public.products p where p.id = product_id)))
  with check (public.restaurant_write_allowed((select p.restaurant_id from public.products p where p.id = product_id)));
create policy product_menu_collections_active_tenant_delete on public.product_menu_collections
  as restrictive for delete to authenticated
  using (public.restaurant_write_allowed((select p.restaurant_id from public.products p where p.id = product_id)));

-- Storage: menu-public (logo, arka plan, slider, ürün ve menü kartı görselleri)
-- Yol: restaurants/{restaurant_id}/... — diğer bucket'lar bu politikadan etkilenmez.
drop policy if exists menu_public_active_tenant_insert on storage.objects;
drop policy if exists menu_public_active_tenant_update on storage.objects;
drop policy if exists menu_public_active_tenant_delete on storage.objects;
create policy menu_public_active_tenant_insert on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'menu-public'
    or public.restaurant_write_allowed(public.try_parse_uuid((storage.foldername(name))[2]))
  );
create policy menu_public_active_tenant_update on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id <> 'menu-public'
    or public.restaurant_write_allowed(public.try_parse_uuid((storage.foldername(name))[2]))
  )
  with check (
    bucket_id <> 'menu-public'
    or public.restaurant_write_allowed(public.try_parse_uuid((storage.foldername(name))[2]))
  );
create policy menu_public_active_tenant_delete on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id <> 'menu-public'
    or public.restaurant_write_allowed(public.try_parse_uuid((storage.foldername(name))[2]))
  );

-- GERİ ALMA (gerekirse):
-- drop policy if exists restaurants_active_tenant_update on public.restaurants;
-- drop policy if exists categories_active_tenant_insert on public.categories;      -- (+ _update, _delete)
-- drop policy if exists menu_collections_active_tenant_insert on public.menu_collections; -- (+ _update, _delete)
-- drop policy if exists products_active_tenant_insert on public.products;          -- (+ _update, _delete)
-- drop policy if exists product_variants_active_tenant_insert on public.product_variants; -- (+ _update, _delete)
-- drop policy if exists category_menu_collections_active_tenant_insert on public.category_menu_collections; -- (+ _update, _delete)
-- drop policy if exists product_menu_collections_active_tenant_insert on public.product_menu_collections;   -- (+ _update, _delete)
-- drop policy if exists menu_public_active_tenant_insert on storage.objects;       -- (+ _update, _delete)
-- drop function if exists public.restaurant_write_allowed(uuid);
