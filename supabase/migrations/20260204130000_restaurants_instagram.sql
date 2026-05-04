-- Karşılama ekranı Instagram bağlantısı (kullanıcı adı veya tam URL). Supabase SQL Editor’de çalıştırın.
alter table public.restaurants
  add column if not exists instagram text;
