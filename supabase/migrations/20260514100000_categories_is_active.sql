-- Müşteri menüsünde kategori göster/gizle (admin panelden).
alter table public.categories
  add column if not exists is_active boolean not null default true;

comment on column public.categories.is_active is 'false ise QR menüde bu kategori ve ürünleri listelenmez.';
