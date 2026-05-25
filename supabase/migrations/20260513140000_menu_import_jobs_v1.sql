-- V1: AI menü içe aktarma işleri (senkron API; tablo denetim ve geçmiş için)
create table if not exists public.menu_import_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  storage_path text not null,
  file_mime text,
  parsed_json jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists menu_import_jobs_restaurant_id_created_at_idx
  on public.menu_import_jobs (restaurant_id, created_at desc);

comment on table public.menu_import_jobs is 'Menü dosyası içe aktarma (V1 senkron işlem; parsed_json AI çıktısı)';

create or replace function public.set_menu_import_jobs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists menu_import_jobs_set_updated_at on public.menu_import_jobs;
create trigger menu_import_jobs_set_updated_at
  before update on public.menu_import_jobs
  for each row execute procedure public.set_menu_import_jobs_updated_at();

alter table public.menu_import_jobs enable row level security;

-- Restoran sahibi kendi işlerini görebilir (gelecekte panelden liste için)
drop policy if exists "menu_import_jobs_select_owner" on public.menu_import_jobs;
create policy "menu_import_jobs_select_owner"
  on public.menu_import_jobs for select
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = menu_import_jobs.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists "menu_import_jobs_insert_owner" on public.menu_import_jobs;
create policy "menu_import_jobs_insert_owner"
  on public.menu_import_jobs for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.restaurants r
      where r.id = menu_import_jobs.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

drop policy if exists "menu_import_jobs_update_owner" on public.menu_import_jobs;
create policy "menu_import_jobs_update_owner"
  on public.menu_import_jobs for update
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = menu_import_jobs.restaurant_id
        and r.owner_id = auth.uid()
    )
  );

-- Storage: sadece kendi klasörüne yükleme (path: imports/{auth.uid()}/...)
drop policy if exists "menu_imports_insert_own_folder" on storage.objects;
create policy "menu_imports_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-images'
    and name like ('imports/' || auth.uid()::text || '/%')
  );

drop policy if exists "menu_imports_select_own_folder" on storage.objects;
create policy "menu_imports_select_own_folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'menu-images'
    and name like ('imports/' || auth.uid()::text || '/%')
  );

drop policy if exists "menu_imports_delete_own_folder" on storage.objects;
create policy "menu_imports_delete_own_folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'menu-images'
    and name like ('imports/' || auth.uid()::text || '/%')
  );
