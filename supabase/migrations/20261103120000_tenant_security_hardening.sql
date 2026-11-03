-- Tenant güvenlik sıkılaştırması (Faz 0).
--
-- 1) restaurants: owner (authenticated) yalnızca görünüm alanlarını güncelleyebilir.
--    tenant_status, subscription_ends_at, owner_id, slug, login_username, name vb.
--    yalnızca service role (sunucu API'leri / master admin) veya platform admin tarafından değişir.
--    Önceki durum: restaurants_owner_update kolon kısıtı olmadığından owner kendi
--    aboneliğini/askısını tarayıcıdan kaldırabiliyordu.
-- 2) restaurants: owner INSERT policy kaldırılır (restoranlar yalnızca master admin
--    API'si / service role ile açılır).
-- 3) menu_import_jobs: owner INSERT/UPDATE policy'leri kaldırılır. Tüm job yazımları
--    sunucu route'larında service role ile yapılıyor; owner'ın storage_path vb.
--    alanları değiştirmesi başka tenant dosyasına erişim riskiydi. SELECT korunur.
--
-- GERİ ALMA (gerekirse):
--   drop trigger if exists restaurants_guard_owner_update on public.restaurants;
--   drop function if exists public.restaurants_guard_owner_update();
--   ve 20260524000500_owner_rls_policies.sql içindeki restaurants_owner_insert ile
--   20260513140000_menu_import_jobs_v1.sql içindeki menu_import_jobs insert/update
--   policy tanımlarını tekrar çalıştır.

-- ---------------------------------------------------------------------------
-- 1) restaurants: owner kolon beyaz listesi
-- ---------------------------------------------------------------------------
create or replace function public.restaurants_guard_owner_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Owner'ın admin panelinden değiştirebildiği alanlar
  -- (lib/admin-menu/save-restaurant-settings.ts → buildRestaurantSettingsDbPayload).
  owner_editable text[] := array[
    'logo_url',
    'theme_color',
    'primary_color',
    'secondary_color',
    'slider_images',
    'welcome_bg_url',
    'instagram',
    'logo_display_mode',
    'theme_id',
    'font_style_id'
  ];
  req_role text := coalesce(auth.role(), '');
begin
  -- service_role (sunucu API'leri) ve doğrudan SQL (dashboard/migration) kısıtlanmaz.
  if req_role not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Yalnızca izinli alanlar değiştiyse ek sorgu yapmadan geç (en sık durum: ayarlar kaydı).
  if (to_jsonb(new) - owner_editable) is not distinct from (to_jsonb(old) - owner_editable) then
    return new;
  end if;

  if public.is_platform_admin() then
    return new;
  end if;

  raise exception 'Bu restoran alanlarını değiştirme yetkiniz yok.'
    using errcode = '42501';
end;
$$;

comment on function public.restaurants_guard_owner_update() is
  'Owner (authenticated) yalnızca görünüm alanlarını güncelleyebilir; abonelik/durum/slug/sahiplik alanları korunur.';

drop trigger if exists restaurants_guard_owner_update on public.restaurants;
create trigger restaurants_guard_owner_update
  before update on public.restaurants
  for each row
  execute function public.restaurants_guard_owner_update();

-- ---------------------------------------------------------------------------
-- 2) restaurants: owner insert kapalı
-- ---------------------------------------------------------------------------
drop policy if exists restaurants_owner_insert on public.restaurants;

-- ---------------------------------------------------------------------------
-- 3) menu_import_jobs: owner yazma kapalı (yalnızca service role)
-- ---------------------------------------------------------------------------
drop policy if exists "menu_import_jobs_insert_owner" on public.menu_import_jobs;
drop policy if exists "menu_import_jobs_update_owner" on public.menu_import_jobs;
