-- Public menu product cards: optional WebP thumbnail URL.
-- Original products.image_url is unchanged; empty thumbnail_url means fallback to image_url.

alter table public.products
  add column if not exists thumbnail_url text default '';

comment on column public.products.thumbnail_url is
  'Kart için küçük görsel public URL. Boşsa public menü image_url kullanır.';
