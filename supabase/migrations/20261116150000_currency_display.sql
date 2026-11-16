-- Faz 2.5c: müşteri menüsünde yaklaşık döviz karşılığı ("≈ 12 €").
--
-- Ne yapar:
--   * public.exchange_rates: günlük kurlar (1 birim döviz = kaç TL). Günlük cron TCMB'den yazar
--     (yalnız service role). Kurlar kamuya açık bilgi olduğu için herkes okuyabilir.
--   * restaurants.display_currencies: müşteri menüsünde gösterilecek dövizler. Varsayılan BOŞ
--     → canlı menüler bu migration sonrası aynen görünür (döviz gösterimi kapalı).
--   * restaurants.fixed_exchange_rates: işletmenin isteğe bağlı sabit kuru, ör. {"EUR": 50}.
--   * Sahip bu iki kolonu kendisi değiştirebilsin diye restaurants_guard_owner_update listesine eklenir.
--
-- Geri alma (veri kaybı yok; fiyatlar TL olarak kalır):
--   alter table public.restaurants drop column if exists display_currencies;
--   alter table public.restaurants drop column if exists fixed_exchange_rates;
--   drop table if exists public.exchange_rates;
--   drop function if exists public.currency_allowed_codes(), public.currency_codes_ok(text[]),
--     public.currency_fixed_rates_ok(jsonb);
--   (restaurants_guard_owner_update: son iki kolonu listeden çıkarmak yeterli)
--   DİKKAT: geri almadan önce yeni kodun (2.5c) canlıdan geri çekilmesi gerekmez; kod kolon yoksa eski sorguya düşer.

-- ---------------------------------------------------------------------------
-- İzinli dövizler (lib/currency/currencies.ts CURRENCY_CODES ile aynı olmalı)
-- ---------------------------------------------------------------------------

create or replace function public.currency_allowed_codes()
returns text[]
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select array['EUR','USD','GBP','RUB','CHF','AZN','SAR','AED','CNY','JPY']::text[]
$$;

create or replace function public.currency_codes_ok(codes text[])
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select codes is not null
    and cardinality(codes) <= 5
    and codes <@ public.currency_allowed_codes()
    and cardinality(codes) = (select count(distinct x) from unnest(codes) as x)
$$;

-- {"EUR": 50, "USD": 45.5}: anahtarlar izinli döviz, değerler 0'dan büyük ve makul sayı.
create or replace function public.currency_fixed_rates_ok(rates jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select rates is not null
    and jsonb_typeof(rates) = 'object'
    and not exists (
      select 1
      from jsonb_each(rates) as e(k, v)
      where not (e.k = any (public.currency_allowed_codes()))
         or jsonb_typeof(e.v) <> 'number'
         or (e.v)::numeric <= 0
         or (e.v)::numeric > 100000
    )
$$;

-- ---------------------------------------------------------------------------
-- exchange_rates
-- ---------------------------------------------------------------------------

create table if not exists public.exchange_rates (
  currency text primary key,
  try_per_unit numeric(18, 6) not null,
  rate_date date not null,
  source text not null default 'tcmb',
  fetched_at timestamptz not null default now(),
  constraint exchange_rates_currency_chk check (currency = any (public.currency_allowed_codes())),
  constraint exchange_rates_rate_chk check (try_per_unit > 0 and try_per_unit < 100000)
);

comment on table public.exchange_rates is
  'Günlük döviz kurları (1 birim = try_per_unit TL). Günlük cron TCMB today.xml ForexSelling yazar. Faz 2.5c.';
comment on column public.exchange_rates.rate_date is 'TCMB bülten tarihi.';
comment on column public.exchange_rates.fetched_at is 'Son başarılı çekim; 72 saatten eskiyse yaklaşık fiyat gizlenir.';

alter table public.exchange_rates enable row level security;

revoke all on table public.exchange_rates from anon, authenticated;
grant select on table public.exchange_rates to anon, authenticated;

drop policy if exists "Exchange rates are public" on public.exchange_rates;
create policy "Exchange rates are public"
  on public.exchange_rates
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- restaurants
-- ---------------------------------------------------------------------------

alter table public.restaurants
  add column if not exists display_currencies text[] not null default array[]::text[];

alter table public.restaurants
  add column if not exists fixed_exchange_rates jsonb not null default '{}'::jsonb;

alter table public.restaurants drop constraint if exists restaurants_display_currencies_chk;
alter table public.restaurants add constraint restaurants_display_currencies_chk
  check (public.currency_codes_ok(display_currencies));

alter table public.restaurants drop constraint if exists restaurants_fixed_exchange_rates_chk;
alter table public.restaurants add constraint restaurants_fixed_exchange_rates_chk
  check (public.currency_fixed_rates_ok(fixed_exchange_rates));

comment on column public.restaurants.display_currencies is
  'Müşteri menüsünde "≈" ile gösterilecek dövizler (boş = kapalı). Faz 2.5c.';
comment on column public.restaurants.fixed_exchange_rates is
  'İşletmenin sabit kuru {"EUR": 50} (1 birim = TL). Boşsa günlük TCMB kuru. Faz 2.5c.';

-- Liste 20261116140000 ile aynı + display_currencies, fixed_exchange_rates.
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
    'display_currencies','fixed_exchange_rates'
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
