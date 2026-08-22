-- Per-menu-collection card visual on the public menu picker.
-- Default "icon" keeps existing heuristic-emoji behavior for all current rows.

alter table public.menu_collections
  add column if not exists card_visual_type text not null default 'icon',
  add column if not exists card_image_url text;

alter table public.menu_collections
  drop constraint if exists menu_collections_card_visual_type_check;

alter table public.menu_collections
  add constraint menu_collections_card_visual_type_check
  check (card_visual_type in ('icon', 'image', 'none'));

comment on column public.menu_collections.card_visual_type is
  'Public menu picker card visual: icon (heuristic emoji), image (card_image_url), none (text-only).';

comment on column public.menu_collections.card_image_url is
  'Optimized WebP URL for card_visual_type=image; ignored otherwise.';

-- Allow tenant uploads under restaurants/{id}/menu-collections/
create or replace function public.storage_menu_public_owner_path(object_name text)
returns boolean
language sql
stable
as $$
  select
    (storage.foldername(object_name))[1] = 'restaurants'
    and (storage.foldername(object_name))[3] in (
      'logo',
      'background',
      'slider',
      'products',
      'menu-collections'
    )
    and exists (
      select 1
      from public.restaurants r
      where r.id = public.try_parse_uuid((storage.foldername(object_name))[2])
        and r.owner_id = auth.uid()
    );
$$;
