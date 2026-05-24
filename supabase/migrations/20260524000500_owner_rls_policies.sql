-- Owner-only RLS for core tenant tables (staging / fresh environments).
-- Public menu must use server route (service role), not direct anon table access.

-- ---------------------------------------------------------------------------
-- restaurants
-- ---------------------------------------------------------------------------
alter table public.restaurants enable row level security;

drop policy if exists restaurants_owner_select on public.restaurants;
drop policy if exists restaurants_owner_insert on public.restaurants;
drop policy if exists restaurants_owner_update on public.restaurants;

create policy restaurants_owner_select
  on public.restaurants
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy restaurants_owner_insert
  on public.restaurants
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy restaurants_owner_update
  on public.restaurants
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Intentionally no DELETE policy for restaurants.

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;

drop policy if exists categories_owner_select on public.categories;
drop policy if exists categories_owner_insert on public.categories;
drop policy if exists categories_owner_update on public.categories;
drop policy if exists categories_owner_delete on public.categories;

create policy categories_owner_select
  on public.categories
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = categories.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

create policy categories_owner_insert
  on public.categories
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.restaurants r
      where r.id = categories.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

create policy categories_owner_update
  on public.categories
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = categories.restaurant_id
        and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.restaurants r
      where r.id = categories.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

create policy categories_owner_delete
  on public.categories
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = categories.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
alter table public.products enable row level security;

drop policy if exists products_owner_select on public.products;
drop policy if exists products_owner_insert on public.products;
drop policy if exists products_owner_update on public.products;
drop policy if exists products_owner_delete on public.products;

create policy products_owner_select
  on public.products
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = products.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

create policy products_owner_insert
  on public.products
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.restaurants r
      where r.id = products.restaurant_id
        and r.owner_id = auth.uid()
    )
    and exists (
      select 1
      from public.categories c
      where c.id = products.category_id
        and c.restaurant_id = products.restaurant_id
    )
  );

create policy products_owner_update
  on public.products
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = products.restaurant_id
        and r.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.restaurants r
      where r.id = products.restaurant_id
        and r.owner_id = auth.uid()
    )
    and exists (
      select 1
      from public.categories c
      where c.id = products.category_id
        and c.restaurant_id = products.restaurant_id
    )
  );

create policy products_owner_delete
  on public.products
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = products.restaurant_id
        and r.owner_id = auth.uid()
    )
  );
