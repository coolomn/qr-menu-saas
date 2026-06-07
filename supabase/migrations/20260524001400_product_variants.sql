-- Product variants: boyut/hacim/fiyat seçenekleri (Faz 1 — DB + RLS only).
-- Additive: mevcut products satırlarına dokunulmaz.

-- ---------------------------------------------------------------------------
-- product_variants
-- ---------------------------------------------------------------------------
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  label text not null,
  label_en text,
  label_ru text,
  price text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.product_variants is
  'Ürün varyantları (boyut, hacim, porsiyon vb.) — fiyat ve etiket varyant seviyesinde.';

create index if not exists product_variants_product_sort_order_idx
  on public.product_variants (product_id, sort_order);

create index if not exists product_variants_restaurant_idx
  on public.product_variants (restaurant_id);

-- ---------------------------------------------------------------------------
-- Tenant consistency: variant.restaurant_id = product.restaurant_id
-- ---------------------------------------------------------------------------
create or replace function public.product_variants_restaurant_match()
returns trigger
language plpgsql
as $$
declare
  product_restaurant_id uuid;
begin
  select p.restaurant_id into product_restaurant_id
  from public.products p
  where p.id = new.product_id;

  if product_restaurant_id is null then
    raise exception 'product_id % does not exist', new.product_id;
  end if;

  if new.restaurant_id is distinct from product_restaurant_id then
    raise exception 'product_variants.restaurant_id must match products.restaurant_id for product_id %',
      new.product_id;
  end if;

  return new;
end;
$$;

comment on function public.product_variants_restaurant_match() is
  'BEFORE INSERT/UPDATE: product_variants.restaurant_id, products.restaurant_id ile aynı olmalı.';

drop trigger if exists product_variants_restaurant_match on public.product_variants;

create trigger product_variants_restaurant_match
  before insert or update on public.product_variants
  for each row
  execute procedure public.product_variants_restaurant_match();

-- ---------------------------------------------------------------------------
-- RLS: owner + platform admin only (no anon)
-- ---------------------------------------------------------------------------
alter table public.product_variants enable row level security;

drop policy if exists product_variants_owner_select on public.product_variants;
drop policy if exists product_variants_owner_insert on public.product_variants;
drop policy if exists product_variants_owner_update on public.product_variants;
drop policy if exists product_variants_owner_delete on public.product_variants;

create policy product_variants_owner_select
  on public.product_variants
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      inner join public.restaurants r on r.id = p.restaurant_id
      where p.id = product_variants.product_id
        and p.restaurant_id = product_variants.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

create policy product_variants_owner_insert
  on public.product_variants
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.products p
      inner join public.restaurants r on r.id = p.restaurant_id
      where p.id = product_variants.product_id
        and p.restaurant_id = product_variants.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

create policy product_variants_owner_update
  on public.product_variants
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      inner join public.restaurants r on r.id = p.restaurant_id
      where p.id = product_variants.product_id
        and p.restaurant_id = product_variants.restaurant_id
        and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      inner join public.restaurants r on r.id = p.restaurant_id
      where p.id = product_variants.product_id
        and p.restaurant_id = product_variants.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

create policy product_variants_owner_delete
  on public.product_variants
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      inner join public.restaurants r on r.id = p.restaurant_id
      where p.id = product_variants.product_id
        and p.restaurant_id = product_variants.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists product_variants_platform_admin_select on public.product_variants;
drop policy if exists product_variants_platform_admin_insert on public.product_variants;
drop policy if exists product_variants_platform_admin_update on public.product_variants;
drop policy if exists product_variants_platform_admin_delete on public.product_variants;

create policy product_variants_platform_admin_select
  on public.product_variants
  for select
  to authenticated
  using (public.is_platform_admin());

create policy product_variants_platform_admin_insert
  on public.product_variants
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy product_variants_platform_admin_update
  on public.product_variants
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy product_variants_platform_admin_delete
  on public.product_variants
  for delete
  to authenticated
  using (public.is_platform_admin());
