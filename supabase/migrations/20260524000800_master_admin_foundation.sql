-- Master admin foundation (V1): platform admins, tenant subscriptions, audit events.
-- Additive only: does not drop or replace existing owner RLS policies.

-- ---------------------------------------------------------------------------
-- platform_admins
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  constraint platform_admins_user_id_unique unique (user_id)
);

comment on table public.platform_admins is 'TapMenu master admin kullanıcıları; yalnızca service role ile yönetilir.';

-- ---------------------------------------------------------------------------
-- restaurant_subscriptions (1:1 tenant billing / limits)
-- ---------------------------------------------------------------------------
create table if not exists public.restaurant_subscriptions (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  plan_type text not null default 'legacy',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active',
  max_products integer,
  max_categories integer,
  max_imports integer,
  import_period text not null default 'monthly',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_subscriptions_plan_type_check
    check (plan_type in ('legacy', '6_months', '12_months', 'custom')),
  constraint restaurant_subscriptions_status_check
    check (status in ('active', 'suspended', 'expired')),
  constraint restaurant_subscriptions_import_period_check
    check (import_period in ('monthly', 'lifetime'))
);

comment on table public.restaurant_subscriptions is 'Restoran abonelik süresi, durumu ve kullanım limitleri.';
comment on column public.restaurant_subscriptions.max_products is 'NULL = sınırsız.';
comment on column public.restaurant_subscriptions.max_categories is 'NULL = sınırsız.';
comment on column public.restaurant_subscriptions.max_imports is 'NULL = sınırsız.';

create index if not exists restaurant_subscriptions_status_ends_at_idx
  on public.restaurant_subscriptions (status, ends_at);

-- ---------------------------------------------------------------------------
-- subscription_events (audit trail)
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  event_type text not null,
  old_values jsonb,
  new_values jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.subscription_events is 'Abonelik değişiklik geçmişi (uzatma, pasifleştirme, limit vb.).';

create index if not exists subscription_events_restaurant_id_created_at_idx
  on public.subscription_events (restaurant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- restaurants: denormalized gate columns
-- ---------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists tenant_status text not null default 'active',
  add column if not exists subscription_ends_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurants_tenant_status_check'
      and conrelid = 'public.restaurants'::regclass
  ) then
    alter table public.restaurants
      add constraint restaurants_tenant_status_check
      check (tenant_status in ('active', 'suspended', 'expired'));
  end if;
end;
$$;

comment on column public.restaurants.tenant_status is 'active | suspended | expired — public menü gate için.';
comment on column public.restaurants.subscription_ends_at is 'Denormalize bitiş tarihi; NULL = süre sınırı yok.';

-- ---------------------------------------------------------------------------
-- updated_at trigger (restaurant_subscriptions)
-- ---------------------------------------------------------------------------
create or replace function public.set_restaurant_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restaurant_subscriptions_set_updated_at on public.restaurant_subscriptions;
create trigger restaurant_subscriptions_set_updated_at
  before update on public.restaurant_subscriptions
  for each row
  execute procedure public.set_restaurant_subscriptions_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: platform admin check (SECURITY DEFINER — reads platform_admins safely)
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;

comment on function public.is_platform_admin() is 'auth.uid() platform_admins içindeyse true. RLS policy''lerde kullanılır.';

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: mevcut restoranlar için legacy subscription satırı
-- ---------------------------------------------------------------------------
insert into public.restaurant_subscriptions (
  restaurant_id,
  plan_type,
  status,
  starts_at,
  ends_at
)
select
  r.id,
  'legacy',
  'active',
  coalesce(r.created_at, now()),
  null
from public.restaurants r
where not exists (
  select 1
  from public.restaurant_subscriptions rs
  where rs.restaurant_id = r.id
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- platform_admins: client erişimi kapalı (yalnızca service role / SECURITY DEFINER)
alter table public.platform_admins enable row level security;

revoke all on table public.platform_admins from anon, authenticated;

-- restaurant_subscriptions
alter table public.restaurant_subscriptions enable row level security;

drop policy if exists restaurant_subscriptions_platform_admin_select on public.restaurant_subscriptions;
drop policy if exists restaurant_subscriptions_platform_admin_insert on public.restaurant_subscriptions;
drop policy if exists restaurant_subscriptions_platform_admin_update on public.restaurant_subscriptions;

create policy restaurant_subscriptions_platform_admin_select
  on public.restaurant_subscriptions
  for select
  to authenticated
  using (public.is_platform_admin());

create policy restaurant_subscriptions_platform_admin_insert
  on public.restaurant_subscriptions
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy restaurant_subscriptions_platform_admin_update
  on public.restaurant_subscriptions
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- subscription_events
alter table public.subscription_events enable row level security;

drop policy if exists subscription_events_platform_admin_select on public.subscription_events;
drop policy if exists subscription_events_platform_admin_insert on public.subscription_events;
drop policy if exists subscription_events_platform_admin_update on public.subscription_events;

create policy subscription_events_platform_admin_select
  on public.subscription_events
  for select
  to authenticated
  using (public.is_platform_admin());

create policy subscription_events_platform_admin_insert
  on public.subscription_events
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy subscription_events_platform_admin_update
  on public.subscription_events
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- restaurants: ek platform admin policy (owner policy''lere dokunulmaz)
drop policy if exists restaurants_platform_admin_select on public.restaurants;
drop policy if exists restaurants_platform_admin_insert on public.restaurants;
drop policy if exists restaurants_platform_admin_update on public.restaurants;

create policy restaurants_platform_admin_select
  on public.restaurants
  for select
  to authenticated
  using (public.is_platform_admin());

create policy restaurants_platform_admin_insert
  on public.restaurants
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy restaurants_platform_admin_update
  on public.restaurants
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
