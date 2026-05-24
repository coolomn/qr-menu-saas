-- Tenant-safe storage policies for menu-public and menu-imports.
-- Legacy menu-images bucket policies are intentionally untouched.

-- ---------------------------------------------------------------------------
-- Helpers (path: restaurants/{restaurantId}/...)
-- storage.foldername(object_name) is 1-based: [1]=restaurants, [2]=restaurant_id, ...
-- ---------------------------------------------------------------------------

create or replace function public.try_parse_uuid(input text)
returns uuid
language plpgsql
stable
as $$
begin
  if input is null or btrim(input) = '' then
    return null;
  end if;
  return input::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.storage_menu_public_owner_path(object_name text)
returns boolean
language sql
stable
as $$
  select
    (storage.foldername(object_name))[1] = 'restaurants'
    and (storage.foldername(object_name))[3] in ('logo', 'background', 'slider', 'products')
    and exists (
      select 1
      from public.restaurants r
      where r.id = public.try_parse_uuid((storage.foldername(object_name))[2])
        and r.owner_id = auth.uid()
    );
$$;

create or replace function public.storage_menu_imports_owner_path(object_name text)
returns boolean
language sql
stable
as $$
  select
    (storage.foldername(object_name))[1] = 'restaurants'
    and (storage.foldername(object_name))[3] = 'imports'
    and (storage.foldername(object_name))[4] = auth.uid()::text
    and exists (
      select 1
      from public.restaurants r
      where r.id = public.try_parse_uuid((storage.foldername(object_name))[2])
        and r.owner_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- menu-public
-- Bucket is public: direct object URLs work without a broad anon SELECT policy.
-- We do not add anon/public SELECT on storage.objects to reduce API listing risk.
-- ---------------------------------------------------------------------------

drop policy if exists menu_public_owner_select on storage.objects;
drop policy if exists menu_public_owner_insert on storage.objects;
drop policy if exists menu_public_owner_update on storage.objects;
drop policy if exists menu_public_owner_delete on storage.objects;

create policy menu_public_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'menu-public'
    and public.storage_menu_public_owner_path(name)
  );

create policy menu_public_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'menu-public'
    and public.storage_menu_public_owner_path(name)
  );

create policy menu_public_owner_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'menu-public'
    and public.storage_menu_public_owner_path(name)
  )
  with check (
    bucket_id = 'menu-public'
    and public.storage_menu_public_owner_path(name)
  );

create policy menu_public_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'menu-public'
    and public.storage_menu_public_owner_path(name)
  );

-- ---------------------------------------------------------------------------
-- menu-imports (private bucket)
-- ---------------------------------------------------------------------------

drop policy if exists menu_imports_owner_select on storage.objects;
drop policy if exists menu_imports_owner_insert on storage.objects;
drop policy if exists menu_imports_owner_update on storage.objects;
drop policy if exists menu_imports_owner_delete on storage.objects;

create policy menu_imports_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'menu-imports'
    and public.storage_menu_imports_owner_path(name)
  );

create policy menu_imports_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'menu-imports'
    and public.storage_menu_imports_owner_path(name)
  );

create policy menu_imports_owner_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'menu-imports'
    and public.storage_menu_imports_owner_path(name)
  )
  with check (
    bucket_id = 'menu-imports'
    and public.storage_menu_imports_owner_path(name)
  );

create policy menu_imports_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'menu-imports'
    and public.storage_menu_imports_owner_path(name)
  );
