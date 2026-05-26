-- Product ↔ menu collection links (per-product visibility within shared categories).
-- Additive only: does not alter products/categories columns.
-- Application layers (public API, owner panel, import) are updated in later phases (E2–E5).

-- ---------------------------------------------------------------------------
-- product_menu_collections (many-to-many)
-- ---------------------------------------------------------------------------
create table if not exists public.product_menu_collections (
  product_id uuid not null references public.products (id) on delete cascade,
  menu_collection_id uuid not null references public.menu_collections (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_id, menu_collection_id)
);

comment on table public.product_menu_collections is 'Ürünün hangi menü koleksiyonlarında göründüğü (kategori paylaşılsa bile menüye göre ayrılabilir).';

create index if not exists product_menu_collections_product_idx
  on public.product_menu_collections (product_id);

create index if not exists product_menu_collections_menu_idx
  on public.product_menu_collections (menu_collection_id);

-- ---------------------------------------------------------------------------
-- Tenant consistency: product and collection must belong to the same restaurant
-- ---------------------------------------------------------------------------
create or replace function public.product_menu_collections_restaurant_match()
returns trigger
language plpgsql
as $$
declare
  product_restaurant_id uuid;
  menu_restaurant_id uuid;
begin
  select p.restaurant_id into product_restaurant_id
  from public.products p
  where p.id = new.product_id;

  select mc.restaurant_id into menu_restaurant_id
  from public.menu_collections mc
  where mc.id = new.menu_collection_id;

  if product_restaurant_id is null then
    raise exception 'product_id % does not exist', new.product_id;
  end if;

  if menu_restaurant_id is null then
    raise exception 'menu_collection_id % does not exist', new.menu_collection_id;
  end if;

  if product_restaurant_id is distinct from menu_restaurant_id then
    raise exception 'product and menu_collection must belong to the same restaurant';
  end if;

  return new;
end;
$$;

comment on function public.product_menu_collections_restaurant_match() is 'BEFORE INSERT/UPDATE: product.restaurant_id ile menu_collection.restaurant_id aynı olmalı; kayıt yoksa hata.';

drop trigger if exists product_menu_collections_restaurant_match on public.product_menu_collections;

create trigger product_menu_collections_restaurant_match
  before insert or update on public.product_menu_collections
  for each row
  execute procedure public.product_menu_collections_restaurant_match();

-- ---------------------------------------------------------------------------
-- Backfill (idempotent): category junctions first, then per-restaurant fallback
-- ---------------------------------------------------------------------------

-- 1) Her ürün → kategorisinin bağlı olduğu menüler
insert into public.product_menu_collections (
  product_id,
  menu_collection_id,
  sort_order
)
select
  p.id,
  cmc.menu_collection_id,
  coalesce(cmc.sort_order, 0)
from public.products p
inner join public.category_menu_collections cmc
  on cmc.category_id = p.category_id
on conflict (product_id, menu_collection_id) do nothing;

-- 2) Hâlâ bağlantısı olmayan ürünler → önce aktif menü (en küçük sort_order);
--    aktif yoksa restoranın herhangi ilk menüsü
insert into public.product_menu_collections (
  product_id,
  menu_collection_id,
  sort_order
)
select
  p.id,
  mc.id,
  coalesce(mc.sort_order, 0)
from public.products p
inner join lateral (
  select
    m.id,
    m.sort_order
  from public.menu_collections m
  where m.restaurant_id = p.restaurant_id
  order by
    case when m.is_active then 0 else 1 end,
    m.sort_order asc,
    m.created_at asc
  limit 1
) mc on true
where not exists (
  select 1
  from public.product_menu_collections pmc
  where pmc.product_id = p.id
)
on conflict (product_id, menu_collection_id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: owner + platform admin only (no anon)
-- ---------------------------------------------------------------------------
alter table public.product_menu_collections enable row level security;

-- product_menu_collections — owner
drop policy if exists product_menu_collections_owner_select on public.product_menu_collections;
drop policy if exists product_menu_collections_owner_insert on public.product_menu_collections;
drop policy if exists product_menu_collections_owner_update on public.product_menu_collections;
drop policy if exists product_menu_collections_owner_delete on public.product_menu_collections;

create policy product_menu_collections_owner_select
  on public.product_menu_collections
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      inner join public.menu_collections mc on mc.restaurant_id = p.restaurant_id
      inner join public.restaurants r on r.id = p.restaurant_id
      where p.id = product_menu_collections.product_id
        and mc.id = product_menu_collections.menu_collection_id
        and r.owner_id = auth.uid()
    )
  );

create policy product_menu_collections_owner_insert
  on public.product_menu_collections
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.products p
      inner join public.menu_collections mc on mc.restaurant_id = p.restaurant_id
      inner join public.restaurants r on r.id = p.restaurant_id
      where p.id = product_menu_collections.product_id
        and mc.id = product_menu_collections.menu_collection_id
        and r.owner_id = auth.uid()
    )
  );

create policy product_menu_collections_owner_update
  on public.product_menu_collections
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      inner join public.menu_collections mc on mc.restaurant_id = p.restaurant_id
      inner join public.restaurants r on r.id = p.restaurant_id
      where p.id = product_menu_collections.product_id
        and mc.id = product_menu_collections.menu_collection_id
        and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      inner join public.menu_collections mc on mc.restaurant_id = p.restaurant_id
      inner join public.restaurants r on r.id = p.restaurant_id
      where p.id = product_menu_collections.product_id
        and mc.id = product_menu_collections.menu_collection_id
        and r.owner_id = auth.uid()
    )
  );

create policy product_menu_collections_owner_delete
  on public.product_menu_collections
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      inner join public.menu_collections mc on mc.restaurant_id = p.restaurant_id
      inner join public.restaurants r on r.id = p.restaurant_id
      where p.id = product_menu_collections.product_id
        and mc.id = product_menu_collections.menu_collection_id
        and r.owner_id = auth.uid()
    )
  );

-- product_menu_collections — platform admin
drop policy if exists product_menu_collections_platform_admin_select on public.product_menu_collections;
drop policy if exists product_menu_collections_platform_admin_insert on public.product_menu_collections;
drop policy if exists product_menu_collections_platform_admin_update on public.product_menu_collections;
drop policy if exists product_menu_collections_platform_admin_delete on public.product_menu_collections;

create policy product_menu_collections_platform_admin_select
  on public.product_menu_collections
  for select
  to authenticated
  using (public.is_platform_admin());

create policy product_menu_collections_platform_admin_insert
  on public.product_menu_collections
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy product_menu_collections_platform_admin_update
  on public.product_menu_collections
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy product_menu_collections_platform_admin_delete
  on public.product_menu_collections
  for delete
  to authenticated
  using (public.is_platform_admin());
