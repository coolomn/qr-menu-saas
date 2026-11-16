-- Faz 2.9: müşteri menüsü üst duyuru şeridi.
--
-- Ne yapar:
--   * restaurants.announcement jsonb: tek duyuru. Varsayılan '{}' = duyuru yok →
--     canlı menüler bu migration sonrası aynen görünür.
--     Biçim: {"enabled":true,"text":"TR metin","translations":{"en":{"text":"…"}},
--             "starts_on":"2026-12-01","ends_on":"2026-12-31"}
--   * CHECK (announcement_ok): yalnız bilinen anahtarlar, metin ≤ 200 karakter, çeviriler izinli
--     dillerde ve yalnız "text" alanı, tarihler YYYY-MM-DD.
--   * Sahip bu kolonu kendisi değiştirebilsin diye restaurants_guard_owner_update listesine eklenir.
--
-- Geri alma (veri kaybı yalnız duyuru metni; menü/fiyatlar etkilenmez):
--   alter table public.restaurants drop constraint if exists restaurants_announcement_chk;
--   alter table public.restaurants drop column if exists announcement;
--   drop function if exists public.announcement_ok(jsonb);
--   (restaurants_guard_owner_update: 'announcement' öğesini listeden çıkarmak yeterli)
--   Kod kolon yoksa eski sorguya düşer; geri almadan önce kodu geri çekmek gerekmez.

create or replace function public.announcement_ok(a jsonb)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  k text;
  v jsonb;
begin
  if a is null or jsonb_typeof(a) <> 'object' then
    return false;
  end if;
  if octet_length(a::text) > 16384 then
    return false;
  end if;
  for k, v in select key, value from jsonb_each(a) loop
    if k = 'enabled' then
      if jsonb_typeof(v) <> 'boolean' then return false; end if;
    elsif k = 'text' then
      if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 200 then return false; end if;
    elsif k = 'translations' then
      if not public.i18n_translations_ok(v, array['text'], 200) then return false; end if;
    elsif k in ('starts_on', 'ends_on') then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.restaurants
  add column if not exists announcement jsonb not null default '{}'::jsonb;

alter table public.restaurants drop constraint if exists restaurants_announcement_chk;
alter table public.restaurants add constraint restaurants_announcement_chk
  check (public.announcement_ok(announcement));

comment on column public.restaurants.announcement is
  'Müşteri menüsü üst duyuru şeridi (tek duyuru, çok dilli, isteğe bağlı tarih aralığı). {} = yok. Faz 2.9.';

-- Liste 20261116150000 ile aynı + announcement.
create or replace function public.restaurants_guard_owner_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_editable text[] := array[
    'logo_url','theme_color','primary_color','secondary_color','slider_images','welcome_bg_url',
    'instagram','logo_display_mode','theme_id','font_style_id',
    'wifi_name','wifi_password','whatsapp_number','google_review_url','opening_hours','social_links','show_price_date',
    'menu_languages',
    'display_currencies','fixed_exchange_rates',
    'announcement'
  ];
  req_role text := coalesce(auth.role(), '');
begin
  if req_role not in ('authenticated', 'anon') then
    return new;
  end if;
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
