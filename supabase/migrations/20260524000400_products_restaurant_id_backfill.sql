-- Safely backfill products.restaurant_id from categories.restaurant_id.
-- Additive/idempotent migration for staging validation. Do not apply to production
-- until production data has been audited with the same validation checks.

alter table public.products
  add column if not exists restaurant_id uuid;

do $$
declare
  total_products bigint;
  missing_category bigint;
  category_without_restaurant bigint;
  already_filled bigint;
begin
  select count(*) into total_products
  from public.products;

  select count(*) into missing_category
  from public.products p
  left join public.categories c on c.id = p.category_id
  where p.category_id is null or c.id is null;

  select count(*) into category_without_restaurant
  from public.products p
  join public.categories c on c.id = p.category_id
  where c.restaurant_id is null;

  select count(*) into already_filled
  from public.products
  where restaurant_id is not null;

  raise notice 'products.restaurant_id precheck: total=%, already_filled=%, missing_category=%, category_without_restaurant=%',
    total_products, already_filled, missing_category, category_without_restaurant;
end;
$$;

update public.products p
set restaurant_id = c.restaurant_id
from public.categories c
where p.category_id = c.id
  and p.restaurant_id is null
  and c.restaurant_id is not null;

do $$
declare
  null_after_backfill bigint;
  mismatch_after_backfill bigint;
begin
  select count(*) into null_after_backfill
  from public.products
  where restaurant_id is null;

  select count(*) into mismatch_after_backfill
  from public.products p
  join public.categories c on c.id = p.category_id
  where p.restaurant_id is not null
    and c.restaurant_id is not null
    and p.restaurant_id <> c.restaurant_id;

  raise notice 'products.restaurant_id post-backfill: null_remaining=%, restaurant_category_mismatch=%',
    null_after_backfill, mismatch_after_backfill;

  if null_after_backfill > 0 then
    raise notice 'products.restaurant_id NOT NULL/FK/index skipped because % rows still have null restaurant_id.',
      null_after_backfill;
    return;
  end if;

  if mismatch_after_backfill > 0 then
    raise notice 'products.restaurant_id NOT NULL/FK/index skipped because % rows do not match their category restaurant_id.',
      mismatch_after_backfill;
    return;
  end if;

  alter table public.products
    alter column restaurant_id set not null;

  if not exists (
    select 1
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
      and att.attnum = any(con.conkey)
    where con.conrelid = 'public.products'::regclass
      and con.confrelid = 'public.restaurants'::regclass
      and con.contype = 'f'
      and att.attname = 'restaurant_id'
  ) then
    alter table public.products
      add constraint products_restaurant_id_fkey
      foreign key (restaurant_id) references public.restaurants (id) on delete cascade;
  else
    raise notice 'products.restaurant_id foreign key already exists; skipping.';
  end if;

  create index if not exists products_restaurant_id_idx
    on public.products (restaurant_id);

  create index if not exists products_restaurant_category_id_idx
    on public.products (restaurant_id, category_id);
end;
$$;

do $$
begin
  if to_regprocedure('public.ensure_product_category_restaurant_match()') is null then
    execute $function$
      create function public.ensure_product_category_restaurant_match()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $body$
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
      $body$;
    $function$;
  else
    raise notice 'Function public.ensure_product_category_restaurant_match() already exists; skipping creation.';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'products_restaurant_category_match'
      and tgrelid = 'public.products'::regclass
      and not tgisinternal
  ) then
    create trigger products_restaurant_category_match
      before insert or update of restaurant_id, category_id
      on public.products
      for each row
      execute function public.ensure_product_category_restaurant_match();
  else
    raise notice 'Trigger products_restaurant_category_match already exists; skipping creation.';
  end if;
end;
$$;

do $$
declare
  final_nulls bigint;
  final_mismatches bigint;
begin
  select count(*) into final_nulls
  from public.products
  where restaurant_id is null;

  select count(*) into final_mismatches
  from public.products p
  join public.categories c on c.id = p.category_id
  where p.restaurant_id is not null
    and c.restaurant_id is not null
    and p.restaurant_id <> c.restaurant_id;

  raise notice 'products.restaurant_id final validation: null_remaining=%, restaurant_category_mismatch=%',
    final_nulls, final_mismatches;
end;
$$;
