-- Kategori çok dilli isimler (müşteri menüsü EN/RU için). Supabase SQL Editor veya CLI ile uygulayın.
alter table public.categories
  add column if not exists name_en text,
  add column if not exists name_ru text;
