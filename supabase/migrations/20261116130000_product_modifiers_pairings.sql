-- Faz 2.4: seçenek grupları (modifier), çıkarılabilir malzemeler, "yanında iyi gider" önerileri.
--
-- Güvenlik/uyumluluk notları:
--   * Yalnızca YENİ tablo/kolon ekler; mevcut satırlara dokunmaz. Yeni kolon boş liste ('[]') başlar
--     → canlı menüler bu migration sonrası aynen görünür.
--   * Seçenek grupları işletme düzeyindedir (bir kez tanımla, birçok ürüne bağla).
--   * Her tabloda restaurant_id vardır; tetikleyiciler bağlanan satırların AYNI işletmeye ait
--     olduğunu zorunlu kılar (başka işletmenin ürününe/grubuna bağlantı kurulamaz).
--   * RLS: sahip (owner) + platform admin; anon erişimi yok (müşteri menüsü service role ile okur).
--     Aboneliği bitmiş işletmeler yazamaz (restaurant_write_allowed, RESTRICTIVE politikalar).
--   * Sipariş sistemi yok: seçenekler müşteriye yalnız bilgi olarak gösterilir.
--
-- Geri alma (gerekirse):
--   drop table if exists public.product_pairings, public.product_modifier_groups,
--     public.modifier_options, public.modifier_groups;
--   drop function if exists public.menu_modifier_links_restaurant_match();
--   alter table public.products drop constraint if exists products_removable_ingredients_chk,
--     drop column if exists removable_ingredients;

-- ---------------------------------------------------------------------------
-- products.removable_ingredients: [{ "name": "Soğan", "name_en": "Onion", "name_ru": "Лук" }, …]
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists removable_ingredients jsonb not null default '[]'::jsonb;

alter table public.products drop constraint if exists products_removable_ingredients_chk;
alter table public.products
  add constraint products_removable_ingredients_chk check (
    jsonb_typeof(removable_ingredients) = 'array'
    and jsonb_array_length(removable_ingredients) <= 30
    and octet_length(removable_ingredients::text) <= 8000
  );

-- ---------------------------------------------------------------------------
-- modifier_groups: işletmenin seçenek grupları ("Soslar · 1 seçin", "Ekstralar · en fazla 3")
-- ---------------------------------------------------------------------------
create table if not exists public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  name_en text,
  name_ru text,
  min_select integer not null default 0,
  max_select integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint modifier_groups_name_chk check (
    char_length(btrim(name)) between 1 and 80
    and (name_en is null or char_length(name_en) <= 80)
    and (name_ru is null or char_length(name_ru) <= 80)
  ),
  constraint modifier_groups_select_chk check (
    min_select between 0 and 50
    and (max_select is null or (max_select between 1 and 50 and max_select >= min_select))
  )
);

comment on table public.modifier_groups is
  'Faz 2.4: işletme düzeyinde seçenek grupları; product_modifier_groups ile ürünlere bağlanır.';
comment on column public.modifier_groups.max_select is 'NULL = sınırsız seçim.';

create index if not exists modifier_groups_restaurant_sort_idx
  on public.modifier_groups (restaurant_id, sort_order);

-- ---------------------------------------------------------------------------
-- modifier_options: grubun seçenekleri (ad, fiyat farkı, kalori)
-- ---------------------------------------------------------------------------
create table if not exists public.modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  name_en text,
  name_ru text,
  price_delta text not null default '',
  calories integer,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint modifier_options_name_chk check (
    char_length(btrim(name)) between 1 and 80
    and (name_en is null or char_length(name_en) <= 80)
    and (name_ru is null or char_length(name_ru) <= 80)
  ),
  constraint modifier_options_price_chk check (char_length(price_delta) <= 20),
  constraint modifier_options_calories_chk check (calories is null or calories between 0 and 10000)
);

comment on table public.modifier_options is 'Faz 2.4: seçenek grubunun satırları; price_delta "+15" gibi metin.';

create index if not exists modifier_options_group_sort_idx on public.modifier_options (group_id, sort_order);
create index if not exists modifier_options_restaurant_idx on public.modifier_options (restaurant_id);

-- ---------------------------------------------------------------------------
-- product_modifier_groups: ürün ↔ grup bağlantısı (ürün içinde sıralı)
-- ---------------------------------------------------------------------------
create table if not exists public.product_modifier_groups (
  product_id uuid not null references public.products (id) on delete cascade,
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_id, group_id)
);

comment on table public.product_modifier_groups is 'Faz 2.4: ürüne bağlı seçenek grupları.';

create index if not exists product_modifier_groups_group_idx on public.product_modifier_groups (group_id);
create index if not exists product_modifier_groups_restaurant_idx on public.product_modifier_groups (restaurant_id);

-- ---------------------------------------------------------------------------
-- product_pairings: "Yanında iyi gider" (ürün → önerilen ürün)
-- ---------------------------------------------------------------------------
create table if not exists public.product_pairings (
  product_id uuid not null references public.products (id) on delete cascade,
  paired_product_id uuid not null references public.products (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_id, paired_product_id),
  constraint product_pairings_not_self_chk check (product_id <> paired_product_id)
);

comment on table public.product_pairings is 'Faz 2.4: ürün detayında gösterilen önerilen ürünler.';

create index if not exists product_pairings_paired_idx on public.product_pairings (paired_product_id);
create index if not exists product_pairings_restaurant_idx on public.product_pairings (restaurant_id);

-- ---------------------------------------------------------------------------
-- İşletme tutarlılığı: bağlanan her satır aynı restaurant_id'ye ait olmalı.
-- SECURITY DEFINER: RLS'in gizlediği satır "yok" sanılmasın; yalnız id → restaurant_id okur.
-- ---------------------------------------------------------------------------
create or replace function public.menu_modifier_links_restaurant_match()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rid uuid;
begin
  if tg_table_name = 'modifier_options' then
    select g.restaurant_id into rid from public.modifier_groups g where g.id = new.group_id;
    if rid is distinct from new.restaurant_id then
      raise exception 'Seçenek, aynı işletmenin grubuna ait olmalı.' using errcode = '23514';
    end if;

  elsif tg_table_name = 'product_modifier_groups' then
    select p.restaurant_id into rid from public.products p where p.id = new.product_id;
    if rid is distinct from new.restaurant_id then
      raise exception 'Ürün aynı işletmeye ait olmalı.' using errcode = '23514';
    end if;
    select g.restaurant_id into rid from public.modifier_groups g where g.id = new.group_id;
    if rid is distinct from new.restaurant_id then
      raise exception 'Seçenek grubu aynı işletmeye ait olmalı.' using errcode = '23514';
    end if;

  elsif tg_table_name = 'product_pairings' then
    select p.restaurant_id into rid from public.products p where p.id = new.product_id;
    if rid is distinct from new.restaurant_id then
      raise exception 'Ürün aynı işletmeye ait olmalı.' using errcode = '23514';
    end if;
    select p.restaurant_id into rid from public.products p where p.id = new.paired_product_id;
    if rid is distinct from new.restaurant_id then
      raise exception 'Önerilen ürün aynı işletmeye ait olmalı.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.menu_modifier_links_restaurant_match() from public, anon, authenticated;

drop trigger if exists modifier_options_restaurant_match on public.modifier_options;
create trigger modifier_options_restaurant_match
  before insert or update of group_id, restaurant_id on public.modifier_options
  for each row execute function public.menu_modifier_links_restaurant_match();

drop trigger if exists product_modifier_groups_restaurant_match on public.product_modifier_groups;
create trigger product_modifier_groups_restaurant_match
  before insert or update of product_id, group_id, restaurant_id on public.product_modifier_groups
  for each row execute function public.menu_modifier_links_restaurant_match();

drop trigger if exists product_pairings_restaurant_match on public.product_pairings;
create trigger product_pairings_restaurant_match
  before insert or update of product_id, paired_product_id, restaurant_id on public.product_pairings
  for each row execute function public.menu_modifier_links_restaurant_match();

-- ---------------------------------------------------------------------------
-- RLS: sahip + platform admin (anon yok) + aboneliği bitmişse yazma yok
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['modifier_groups', 'modifier_options', 'product_modifier_groups', 'product_pairings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);

    -- Sahip: kendi işletmesinin satırları
    execute format('drop policy if exists %I on public.%I', t || '_owner_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (restaurant_id in (select r.id from public.restaurants r where r.owner_id = (select auth.uid())))
         with check (restaurant_id in (select r.id from public.restaurants r where r.owner_id = (select auth.uid())))',
      t || '_owner_all', t);

    -- Platform admin (master panel)
    execute format('drop policy if exists %I on public.%I', t || '_platform_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.is_platform_admin()))
         with check ((select public.is_platform_admin()))',
      t || '_platform_admin_all', t);

    -- Aboneliği bitmiş / askıdaki işletme yazamaz (AND'lenen kısıtlayıcı politikalar)
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
