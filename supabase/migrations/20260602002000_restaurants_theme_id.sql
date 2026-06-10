-- Public menü tema kimliği (classic varsayılan).
alter table public.restaurants
  add column if not exists theme_id text not null default 'classic';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurants_theme_id_check'
      and conrelid = 'public.restaurants'::regclass
  ) then
    alter table public.restaurants
      add constraint restaurants_theme_id_check
      check (theme_id in ('classic', 'modern', 'premium', 'beach', 'dark'));
  end if;
end $$;

comment on column public.restaurants.theme_id is
  'Public menü teması: classic | modern | premium | beach | dark';
