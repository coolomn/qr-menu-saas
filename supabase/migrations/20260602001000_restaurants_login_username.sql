-- Owner panel: e-posta veya login_username ile giriş (Supabase Auth hâlâ email/password).
alter table public.restaurants
  add column if not exists login_username text;

comment on column public.restaurants.login_username is
  'Owner panel girişi için benzersiz kullanıcı adı (lowercase; a-z, 0-9, -, _).';

create unique index if not exists restaurants_login_username_unique_idx
  on public.restaurants (login_username)
  where login_username is not null and login_username <> '';
