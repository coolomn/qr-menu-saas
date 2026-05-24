-- Baseline indexes, foreign keys, and tenant consistency guards.
-- Designed for fresh staging setup. Do not apply directly to production without
-- validating existing data first.

create unique index if not exists restaurants_slug_unique_idx
  on public.restaurants (slug);

create index if not exists restaurants_owner_id_idx
  on public.restaurants (owner_id);

create index if not exists categories_restaurant_id_idx
  on public.categories (restaurant_id);

create index if not exists categories_restaurant_sort_order_idx
  on public.categories (restaurant_id, sort_order);

create index if not exists products_restaurant_id_idx
  on public.products (restaurant_id);

create index if not exists products_category_id_idx
  on public.products (category_id);

create index if not exists products_restaurant_category_id_idx
  on public.products (restaurant_id, category_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurants_owner_id_fkey'
      and conrelid = 'public.restaurants'::regclass
  ) then
    alter table public.restaurants
      add constraint restaurants_owner_id_fkey
      foreign key (owner_id) references auth.users (id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_restaurant_id_fkey'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_restaurant_id_fkey
      foreign key (restaurant_id) references public.restaurants (id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_restaurant_id_fkey'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_restaurant_id_fkey
      foreign key (restaurant_id) references public.restaurants (id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_category_id_fkey'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_category_id_fkey
      foreign key (category_id) references public.categories (id) on delete restrict;
  end if;
end;
$$;

create or replace function public.ensure_product_category_restaurant_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  category_restaurant_id uuid;
begin
  select c.restaurant_id
    into category_restaurant_id
  from public.categories c
  where c.id = new.category_id;

  if category_restaurant_id is null then
    raise exception 'Product category does not exist or has no restaurant_id.';
  end if;

  if new.restaurant_id is null then
    new.restaurant_id := category_restaurant_id;
  end if;

  if new.restaurant_id <> category_restaurant_id then
    raise exception 'Product restaurant_id must match category restaurant_id.';
  end if;

  return new;
end;
$$;

drop trigger if exists products_restaurant_category_match on public.products;

create trigger products_restaurant_category_match
  before insert or update of restaurant_id, category_id
  on public.products
  for each row
  execute function public.ensure_product_category_restaurant_match();

do $$
begin
  if not exists (select 1 from public.products where restaurant_id is null) then
    alter table public.products alter column restaurant_id set not null;
  else
    raise notice 'products.restaurant_id still has null values; NOT NULL was not applied.';
  end if;
end;
$$;
