-- Logo görünüm modu: public menüde logonun kart/stil davranışı.
alter table public.restaurants
  add column if not exists logo_display_mode text not null default 'auto';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurants_logo_display_mode_check'
      and conrelid = 'public.restaurants'::regclass
  ) then
    alter table public.restaurants
      add constraint restaurants_logo_display_mode_check
      check (logo_display_mode in ('auto', 'light-card', 'dark-card', 'none'));
  end if;
end $$;

comment on column public.restaurants.logo_display_mode is
  'Public menü logo görünümü: auto | light-card | dark-card | none';
