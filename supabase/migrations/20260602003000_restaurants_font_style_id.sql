-- Menü yazı tipi stili (görünümden bağımsız).
alter table public.restaurants
  add column if not exists font_style_id text not null default 'classic';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurants_font_style_id_check'
      and conrelid = 'public.restaurants'::regclass
  ) then
    alter table public.restaurants
      add constraint restaurants_font_style_id_check
      check (font_style_id in ('classic', 'modern', 'premium', 'geometric'));
  end if;
end $$;

-- Faz 1a theme_id (görünüm+font birlikte) → bağımsız font_style_id eşlemesi.
update public.restaurants
set font_style_id = case theme_id
  when 'modern' then 'modern'
  when 'premium' then 'premium'
  when 'dark' then 'geometric'
  else 'classic'
end;

comment on column public.restaurants.theme_id is
  'Menü görünüm stili: classic | modern | premium | beach | dark';

comment on column public.restaurants.font_style_id is
  'Menü yazı tipi stili: classic | modern | premium | geometric';
