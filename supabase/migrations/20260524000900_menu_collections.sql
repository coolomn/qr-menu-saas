-- Menu collections: restaurant-scoped menus and category ↔ collection links.
-- Additive only: does not alter categories/products columns or remove data.
-- Public menu (service role) is unchanged until application reads these tables.

-- ---------------------------------------------------------------------------
-- updated_at helper for menu_collections
-- ---------------------------------------------------------------------------
create or replace function public.set_menu_collections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_menu_collections_updated_at() is 'BEFORE UPDATE trigger: sets updated_at = now().';

-- ---------------------------------------------------------------------------
-- menu_collections
-- ---------------------------------------------------------------------------
create table if not exists public.menu_collections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  name_en text,
  name_ru text,
  description text,
  start_time time,
  end_time time,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_collections_restaurant_name_unique unique (restaurant_id, name)
);

comment on table public.menu_collections is 'Restoran menüleri (Öğle, Akşam, İçecekler, Ana Menü vb.).';

create index if not exists menu_collections_restaurant_id_idx
  on public.menu_collections (restaurant_id);

create index if not exists menu_collections_restaurant_sort_idx
  on public.menu_collections (restaurant_id, sort_order);

drop trigger if exists menu_collections_set_updated_at on public.menu_collections;

create trigger menu_collections_set_updated_at
  before update on public.menu_collections
  for each row
  execute procedure public.set_menu_collections_updated_at();

-- ---------------------------------------------------------------------------
-- category_menu_collections (many-to-many)
-- ---------------------------------------------------------------------------
create table if not exists public.category_menu_collections (
  category_id uuid not null references public.categories (id) on delete cascade,
  menu_collection_id uuid not null references public.menu_collections (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (category_id, menu_collection_id)
);

comment on table public.category_menu_collections is 'Kategorinin hangi menü koleksiyonlarında göründüğü.';

create index if not exists category_menu_collections_menu_idx
  on public.category_menu_collections (menu_collection_id);

create index if not exists category_menu_collections_category_idx
  on public.category_menu_collections (category_id);

-- ---------------------------------------------------------------------------
-- Tenant consistency: category and collection must belong to the same restaurant
-- ---------------------------------------------------------------------------
create or replace function public.category_menu_collections_restaurant_match()
returns trigger
language plpgsql
as $$
declare
  cat_restaurant_id uuid;
  menu_restaurant_id uuid;
begin
  select c.restaurant_id into cat_restaurant_id
  from public.categories c
  where c.id = new.category_id;

  select mc.restaurant_id into menu_restaurant_id
  from public.menu_collections mc
  where mc.id = new.menu_collection_id;

  if cat_restaurant_id is null then
    raise exception 'category_id % does not exist', new.category_id;
  end if;

  if menu_restaurant_id is null then
    raise exception 'menu_collection_id % does not exist', new.menu_collection_id;
  end if;

  if cat_restaurant_id is distinct from menu_restaurant_id then
    raise exception 'category and menu_collection must belong to the same restaurant';
  end if;

  return new;
end;
$$;

drop trigger if exists category_menu_collections_restaurant_match on public.category_menu_collections;

create trigger category_menu_collections_restaurant_match
  before insert or update on public.category_menu_collections
  for each row
  execute procedure public.category_menu_collections_restaurant_match();

-- ---------------------------------------------------------------------------
-- Backfill: default "Ana Menü" per restaurant + link all existing categories
-- (idempotent)
-- ---------------------------------------------------------------------------
insert into public.menu_collections (
  restaurant_id,
  name,
  name_en,
  name_ru,
  is_active,
  sort_order
)
select
  r.id,
  'Ana Menü',
  'Main Menu',
  'Главное меню',
  true,
  0
from public.restaurants r
where not exists (
  select 1
  from public.menu_collections mc
  where mc.restaurant_id = r.id
    and mc.name = 'Ana Menü'
);

insert into public.category_menu_collections (
  category_id,
  menu_collection_id,
  sort_order
)
select
  c.id,
  mc.id,
  coalesce(c.sort_order, 0)
from public.categories c
inner join public.menu_collections mc
  on mc.restaurant_id = c.restaurant_id
  and mc.name = 'Ana Menü'
where not exists (
  select 1
  from public.category_menu_collections cmc
  where cmc.category_id = c.id
    and cmc.menu_collection_id = mc.id
);

-- ---------------------------------------------------------------------------
-- RLS: owner + platform admin only (no anon)
-- ---------------------------------------------------------------------------
alter table public.menu_collections enable row level security;

alter table public.category_menu_collections enable row level security;

-- menu_collections — owner
drop policy if exists menu_collections_owner_select on public.menu_collections;
drop policy if exists menu_collections_owner_insert on public.menu_collections;
drop policy if exists menu_collections_owner_update on public.menu_collections;
drop policy if exists menu_collections_owner_delete on public.menu_collections;

create policy menu_collections_owner_select
  on public.menu_collections
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = menu_collections.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

create policy menu_collections_owner_insert
  on public.menu_collections
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.restaurants r
      where r.id = menu_collections.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

create policy menu_collections_owner_update
  on public.menu_collections
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = menu_collections.restaurant_id
        and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.restaurants r
      where r.id = menu_collections.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

create policy menu_collections_owner_delete
  on public.menu_collections
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = menu_collections.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

-- menu_collections — platform admin
drop policy if exists menu_collections_platform_admin_select on public.menu_collections;
drop policy if exists menu_collections_platform_admin_insert on public.menu_collections;
drop policy if exists menu_collections_platform_admin_update on public.menu_collections;
drop policy if exists menu_collections_platform_admin_delete on public.menu_collections;

create policy menu_collections_platform_admin_select
  on public.menu_collections
  for select
  to authenticated
  using (public.is_platform_admin());

create policy menu_collections_platform_admin_insert
  on public.menu_collections
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy menu_collections_platform_admin_update
  on public.menu_collections
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy menu_collections_platform_admin_delete
  on public.menu_collections
  for delete
  to authenticated
  using (public.is_platform_admin());

-- category_menu_collections — owner (same-restaurant category + collection)
drop policy if exists category_menu_collections_owner_select on public.category_menu_collections;
drop policy if exists category_menu_collections_owner_insert on public.category_menu_collections;
drop policy if exists category_menu_collections_owner_update on public.category_menu_collections;
drop policy if exists category_menu_collections_owner_delete on public.category_menu_collections;

create policy category_menu_collections_owner_select
  on public.category_menu_collections
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.categories c
      inner join public.menu_collections mc on mc.restaurant_id = c.restaurant_id
      inner join public.restaurants r on r.id = c.restaurant_id
      where c.id = category_menu_collections.category_id
        and mc.id = category_menu_collections.menu_collection_id
        and r.owner_id = auth.uid()
    )
  );

create policy category_menu_collections_owner_insert
  on public.category_menu_collections
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.categories c
      inner join public.menu_collections mc on mc.restaurant_id = c.restaurant_id
      inner join public.restaurants r on r.id = c.restaurant_id
      where c.id = category_menu_collections.category_id
        and mc.id = category_menu_collections.menu_collection_id
        and r.owner_id = auth.uid()
    )
  );

create policy category_menu_collections_owner_update
  on public.category_menu_collections
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.categories c
      inner join public.menu_collections mc on mc.restaurant_id = c.restaurant_id
      inner join public.restaurants r on r.id = c.restaurant_id
      where c.id = category_menu_collections.category_id
        and mc.id = category_menu_collections.menu_collection_id
        and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.categories c
      inner join public.menu_collections mc on mc.restaurant_id = c.restaurant_id
      inner join public.restaurants r on r.id = c.restaurant_id
      where c.id = category_menu_collections.category_id
        and mc.id = category_menu_collections.menu_collection_id
        and r.owner_id = auth.uid()
    )
  );

create policy category_menu_collections_owner_delete
  on public.category_menu_collections
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.categories c
      inner join public.menu_collections mc on mc.restaurant_id = c.restaurant_id
      inner join public.restaurants r on r.id = c.restaurant_id
      where c.id = category_menu_collections.category_id
        and mc.id = category_menu_collections.menu_collection_id
        and r.owner_id = auth.uid()
    )
  );

-- category_menu_collections — platform admin
drop policy if exists category_menu_collections_platform_admin_select on public.category_menu_collections;
drop policy if exists category_menu_collections_platform_admin_insert on public.category_menu_collections;
drop policy if exists category_menu_collections_platform_admin_update on public.category_menu_collections;
drop policy if exists category_menu_collections_platform_admin_delete on public.category_menu_collections;

create policy category_menu_collections_platform_admin_select
  on public.category_menu_collections
  for select
  to authenticated
  using (public.is_platform_admin());

create policy category_menu_collections_platform_admin_insert
  on public.category_menu_collections
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy category_menu_collections_platform_admin_update
  on public.category_menu_collections
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy category_menu_collections_platform_admin_delete
  on public.category_menu_collections
  for delete
  to authenticated
  using (public.is_platform_admin());
