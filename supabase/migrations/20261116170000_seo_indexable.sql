-- Faz 2.11a: restoran başına "Google'da görünsün" anahtarı.
--
-- Ne yapar:
--   * restaurants.seo_indexable boolean not null default true.
--     Varsayılan TRUE = bugünkü davranış (menüler zaten noindex değil); canlı hiçbir şey değişmez.
--     FALSE → menü ve ürün sayfaları noindex olur, site haritasında yer almaz.
--   * Sahip bu kolonu kendisi değiştirebilsin diye restaurants_guard_owner_update listesine eklenir.
--
-- Geri alma (veri kaybı yalnız bu anahtarın değeri):
--   alter table public.restaurants drop column if exists seo_indexable;
--   (restaurants_guard_owner_update: 'seo_indexable' öğesini listeden çıkarmak yeterli)
--   Kod kolon yoksa "açık" varsayar; geri almadan önce kodu geri çekmek gerekmez.

alter table public.restaurants
  add column if not exists seo_indexable boolean not null default true;

comment on column public.restaurants.seo_indexable is
  'Menü/ürün sayfaları arama motorlarına açık mı (true) yoksa noindex mi (false). Faz 2.11a.';

-- Liste 20261116160000 ile aynı + seo_indexable.
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
    'announcement',
    'seo_indexable'
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
