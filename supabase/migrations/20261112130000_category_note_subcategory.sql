-- Faz 2.2: kategori notu + alt kategori (tek seviye).
--
-- Güvenlik/uyumluluk notları:
--   * Yalnızca YENİ kolon/indeks/tetikleyici ekler; mevcut satırlara dokunmaz.
--   * Yeni kolonlar boş başlar → canlı menüler bu migration sonrası aynen görünür.
--   * parent_id aynı restorana ait, kendisi alt kategori OLMAYAN bir kategoriyi göstermeli
--     (tek seviye). Kontrol AFTER/constraint tetikleyiciyle ifade sonunda yapılır: menü yedeğinden
--     geri yüklemede üst ve alt kategoriler aynı toplu insert'te gelebilir.
--   * Üst kategori silinirse alt kategoriler üst seviyeye çıkar (ON DELETE SET NULL); ürün silinmez.
--
-- Geri alma (gerekirse):
--   drop trigger if exists categories_check_parent on public.categories;
--   drop function if exists public.categories_check_parent();
--   drop index if exists public.categories_parent_id_idx;
--   alter table public.categories drop column parent_id, drop column note,
--     drop column note_en, drop column note_ru;

alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete set null,
  add column if not exists note text,
  add column if not exists note_en text,
  add column if not exists note_ru text;

alter table public.categories drop constraint if exists categories_note_len_chk;
alter table public.categories
  add constraint categories_note_len_chk check (
    (note is null or char_length(note) <= 500)
    and (note_en is null or char_length(note_en) <= 500)
    and (note_ru is null or char_length(note_ru) <= 500)
  );

alter table public.categories drop constraint if exists categories_parent_not_self_chk;
alter table public.categories
  add constraint categories_parent_not_self_chk check (parent_id is null or parent_id <> id);

create index if not exists categories_parent_id_idx on public.categories (parent_id);

create or replace function public.categories_check_parent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_restaurant uuid;
  parent_parent uuid;
begin
  if new.parent_id is not null then
    select c.restaurant_id, c.parent_id
      into parent_restaurant, parent_parent
      from public.categories c
     where c.id = new.parent_id;

    if parent_restaurant is null or parent_restaurant <> new.restaurant_id then
      raise exception 'Üst kategori aynı işletmeye ait olmalı.' using errcode = '23514';
    end if;
    if parent_parent is not null then
      raise exception 'Alt kategorinin altına kategori eklenemez (tek seviye).' using errcode = '23514';
    end if;
    if exists (select 1 from public.categories c where c.parent_id = new.id) then
      raise exception 'Alt kategorisi olan bir kategori başka bir kategorinin altına taşınamaz.'
        using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.categories_check_parent() from public, anon, authenticated;

drop trigger if exists categories_check_parent on public.categories;
create constraint trigger categories_check_parent
  after insert or update of parent_id, restaurant_id on public.categories
  for each row
  execute function public.categories_check_parent();
