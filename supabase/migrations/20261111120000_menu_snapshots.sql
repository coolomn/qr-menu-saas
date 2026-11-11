-- Menü sıfırlamadan önce alınan otomatik yedekler (30 gün saklanır).
-- Yalnızca service_role erişir: RLS açık, hiç politika yok (sahipler bile okuyamaz).
-- Mevcut tablolara dokunmaz, veri silmez.

create table if not exists public.menu_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reason text not null default 'menu_reset',
  counts jsonb not null default '{}'::jsonb,
  data jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists menu_snapshots_restaurant_created_idx
  on public.menu_snapshots (restaurant_id, created_at desc);

alter table public.menu_snapshots enable row level security;

comment on table public.menu_snapshots is
  'Menü sıfırlama öncesi JSON yedek. Yalnızca service_role; 30 gün sonra expires_at ile temizlenir.';
