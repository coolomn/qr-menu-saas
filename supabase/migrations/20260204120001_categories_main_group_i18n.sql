-- Ana grup çok dilli etiketler (karşılama EN/RU). Önceki name_en migration ile birlikte veya ayrı çalıştırılabilir.
alter table public.categories
  add column if not exists main_group_en text,
  add column if not exists main_group_ru text;
