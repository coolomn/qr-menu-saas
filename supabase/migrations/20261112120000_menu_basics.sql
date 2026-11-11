-- Faz 2.1: menü temel özellikleri (tükendi, rozetler, besin değerleri, fiyat güncelleme tarihi,
-- Wi-Fi, WhatsApp, Google yorum linki, çalışma saatleri, sosyal hesaplar).
--
-- Güvenlik/uyumluluk notları:
--   * Yalnızca YENİ kolon ekler; mevcut veriye dokunmaz, hiçbir satırı silmez/değiştirmez.
--   * Tüm yeni alanlar boş/kapalı başlar → canlı menüler bu migration sonrası değişmez.
--   * restaurants_guard_owner_update (20261103120000) owner'ın yazabileceği kolonları sınırlar;
--     yeni restoran kolonları o listeye eklenmezse ayarlar kaydı tüm restoranlarda bozulur.
--     Bu yüzden fonksiyon aşağıda yeni listeyle yeniden tanımlanır
--     (lib/admin-menu/restaurant-owner-columns.test.ts bu listeyi koddaki payload ile karşılaştırır).
--
-- Geri alma (gerekirse):
--   drop trigger if exists products_set_price_updated_at on public.products;
--   drop function if exists public.products_set_price_updated_at();
--   alter table public.products drop column is_sold_out, drop column badges, drop column calories,
--     drop column protein_g, drop column carbs_g, drop column fat_g, drop column price_updated_at;
--   alter table public.restaurants drop column wifi_name, drop column wifi_password,
--     drop column whatsapp_number, drop column google_review_url, drop column opening_hours,
--     drop column social_links, drop column show_price_date;
--   (guard fonksiyonunu 20261103120000_tenant_security_hardening.sql'deki haline geri döndür)

-- ---------------------------------------------------------------------------
-- 1) products
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists is_sold_out boolean not null default false,
  add column if not exists badges text[] not null default '{}'::text[],
  add column if not exists calories integer,
  add column if not exists protein_g numeric(6,1),
  add column if not exists carbs_g numeric(6,1),
  add column if not exists fat_g numeric(6,1),
  add column if not exists price_updated_at timestamptz;

alter table public.products drop constraint if exists products_badges_len_chk;
alter table public.products
  add constraint products_badges_len_chk check (cardinality(badges) <= 8);

alter table public.products drop constraint if exists products_nutrition_range_chk;
alter table public.products
  add constraint products_nutrition_range_chk check (
    (calories is null or (calories >= 0 and calories <= 20000))
    and (protein_g is null or (protein_g >= 0 and protein_g <= 5000))
    and (carbs_g is null or (carbs_g >= 0 and carbs_g <= 5000))
    and (fat_g is null or (fat_g >= 0 and fat_g <= 5000))
  );

-- Fiyat değişince tarihi otomatik güncelle. Eklemede boşsa şimdi; geri yükleme (snapshot) mevcut
-- değeri korur. Mevcut ürünler NULL kalır (ilk fiyat değişikliğine kadar tarih gösterilmez).
create or replace function public.products_set_price_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.price_updated_at := coalesce(new.price_updated_at, now());
  elsif new.price is distinct from old.price then
    new.price_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists products_set_price_updated_at on public.products;
create trigger products_set_price_updated_at
  before insert or update on public.products
  for each row
  execute function public.products_set_price_updated_at();

-- ---------------------------------------------------------------------------
-- 2) restaurants
-- ---------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists wifi_name text,
  add column if not exists wifi_password text,
  add column if not exists whatsapp_number text,
  add column if not exists google_review_url text,
  add column if not exists opening_hours jsonb,
  add column if not exists social_links jsonb not null default '{}'::jsonb,
  add column if not exists show_price_date boolean not null default false;

alter table public.restaurants drop constraint if exists restaurants_venue_info_chk;
alter table public.restaurants
  add constraint restaurants_venue_info_chk check (
    (wifi_name is null or char_length(wifi_name) <= 64)
    and (wifi_password is null or char_length(wifi_password) <= 64)
    and (whatsapp_number is null or char_length(whatsapp_number) <= 20)
    and (google_review_url is null or char_length(google_review_url) <= 500)
    and (opening_hours is null or (jsonb_typeof(opening_hours) = 'object' and pg_column_size(opening_hours) <= 2000))
    and jsonb_typeof(social_links) = 'object'
    and pg_column_size(social_links) <= 4000
  );

-- ---------------------------------------------------------------------------
-- 3) Owner kolon beyaz listesi (yeni alanlar eklendi)
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
    'font_style_id',
    'wifi_name',
    'wifi_password',
    'whatsapp_number',
    'google_review_url',
    'opening_hours',
    'social_links',
    'show_price_date'
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
