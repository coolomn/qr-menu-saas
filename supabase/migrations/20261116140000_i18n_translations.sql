-- Faz 2.5a: çoklu dil altyapısı.
--
-- Ne yapar:
--   * Çevrilebilir 6 tabloya `translations jsonb` ekler: {"en":{"name":"…"},"de":{"name":"…"}}.
--     Türkçe (ana dil) her zaman mevcut name/description/label… kolonlarında kalır.
--   * Mevcut _en/_ru kolonlarını translations'a kopyalar (backfill). Hiçbir çeviri silinmez.
--   * GEÇİŞ DÖNEMİ senkron tetikleyicisi: eski _en/_ru kolonu değişirse translations'a,
--     translations değişirse eski kolona yazar (ikisi aynı anda değişirse translations kazanır).
--     Böylece eski kod, yeni kod ve geri dönüş (rollback) aynı veriyi görür.
--   * restaurants.menu_languages: müşteri menüsünde gösterilecek diller. Varsayılan {tr,en,ru}
--     = bugünkü görünüm → canlı menüler bu migration sonrası aynen görünür.
--
-- Geri alma (gerekirse; eski _en/_ru kolonları hâlâ dolu olduğu için veri kaybı yok):
--   drop trigger if exists categories_i18n_sync on public.categories;            -- (6 tablo için)
--   alter table public.categories drop column if exists translations;           -- (6 tablo için)
--   alter table public.restaurants drop column if exists menu_languages;
--   drop function if exists public.i18n_sync_legacy_columns(), public.i18n_translations_ok(jsonb, text[], int),
--     public.i18n_normalize(jsonb), public.i18n_allowed_languages(), public.i18n_menu_languages_ok(text[]);
--   (restaurants_guard_owner_update: 'menu_languages' satırını listeden çıkarmak yeterli)
--   DİKKAT: geri almadan SONRA, bu migration'dan sonra alınmış menu_snapshots geri yüklenemez
--   (yedekte translations alanı var, tabloda kolon yok). Migration öncesi yedekler sorunsuz yüklenir.
--
-- Tetikleyiciler yalnız ilgili kolonlar UPDATE edildiğinde çalışır (sıralama/fiyat/aktiflik güncellemeleri etkilenmez).

-- ---------------------------------------------------------------------------
-- Yardımcı fonksiyonlar
-- ---------------------------------------------------------------------------

-- translations içinde izin verilen diller (TR ana dildir, translations'ta tutulmaz).
create or replace function public.i18n_allowed_languages()
returns text[]
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$ select array['en','ru','de','fr','es','it','uk','zh','az']::text[] $$;

-- Boş/yalnız boşluk metinleri ve boş dil nesnelerini atar, metinleri kırpar.
-- Metin olmayan değerlere dokunmaz (CHECK onları reddeder).
create or replace function public.i18n_normalize(t jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  result jsonb := '{}'::jsonb;
  lang_key text;
  lang_val jsonb;
  field_key text;
  field_val jsonb;
  cleaned jsonb;
begin
  if t is null or jsonb_typeof(t) <> 'object' then
    return coalesce(t, '{}'::jsonb);
  end if;
  for lang_key, lang_val in select key, value from jsonb_each(t) loop
    if jsonb_typeof(lang_val) <> 'object' then
      result := result || jsonb_build_object(lang_key, lang_val);
      continue;
    end if;
    cleaned := '{}'::jsonb;
    for field_key, field_val in select key, value from jsonb_each(lang_val) loop
      if jsonb_typeof(field_val) = 'null' then
        continue;
      elsif jsonb_typeof(field_val) = 'string' then
        if btrim(field_val #>> '{}') <> '' then
          cleaned := cleaned || jsonb_build_object(field_key, btrim(field_val #>> '{}'));
        end if;
      else
        cleaned := cleaned || jsonb_build_object(field_key, field_val);
      end if;
    end loop;
    if cleaned <> '{}'::jsonb then
      result := result || jsonb_build_object(lang_key, cleaned);
    end if;
  end loop;
  return result;
end;
$$;

-- Şekil kontrolü: nesne; anahtarlar izinli dil; değerler nesne; alanlar izinli; değerler metin ve sınır içinde.
create or replace function public.i18n_translations_ok(t jsonb, fields text[], max_len int)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  lang_key text;
  lang_val jsonb;
  field_key text;
  field_val jsonb;
begin
  if t is null or jsonb_typeof(t) <> 'object' then
    return false;
  end if;
  if octet_length(t::text) > 65536 then
    return false;
  end if;
  for lang_key, lang_val in select key, value from jsonb_each(t) loop
    if not (lang_key = any (public.i18n_allowed_languages())) then
      return false;
    end if;
    if jsonb_typeof(lang_val) <> 'object' then
      return false;
    end if;
    for field_key, field_val in select key, value from jsonb_each(lang_val) loop
      if not (field_key = any (fields)) then
        return false;
      end if;
      if jsonb_typeof(field_val) <> 'string' or char_length(field_val #>> '{}') > max_len then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

-- Geçiş dönemi senkronu. TG_ARGV = eski kolonu olan alanlar (ör. 'name','description').
-- Her alan için <alan>_en ve <alan>_ru kolonları translations->en/ru->alan ile eşitlenir.
create or replace function public.i18n_sync_legacy_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  new_row jsonb := to_jsonb(new);
  old_row jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  t jsonb := public.i18n_normalize(coalesce(new.translations, '{}'::jsonb));
  old_t jsonb := case when tg_op = 'UPDATE'
    then public.i18n_normalize(coalesce(old.translations, '{}'::jsonb)) else '{}'::jsonb end;
  column_patch jsonb := '{}'::jsonb;
  field text;
  lang text;
  col text;
  col_val text;
  tr_val text;
  tr_changed boolean;
  col_changed boolean;
  i int;
begin
  for i in 0 .. coalesce(tg_nargs, 0) - 1 loop
    field := tg_argv[i];
    foreach lang in array array['en', 'ru'] loop
      col := field || '_' || lang;
      col_val := nullif(btrim(coalesce(new_row ->> col, '')), '');
      tr_val := t -> lang ->> field;

      if tg_op = 'UPDATE' then
        tr_changed := tr_val is distinct from (old_t -> lang ->> field);
        col_changed := (new_row ->> col) is distinct from (old_row ->> col);
      else
        tr_changed := tr_val is not null;
        col_changed := col_val is not null;
      end if;

      if tr_changed then
        -- Yeni kod translations'a yazdı → eski kolonu eşitle.
        column_patch := column_patch || jsonb_build_object(col, tr_val);
      elsif col_changed then
        -- Eski kod (veya geri dönülmüş sürüm) eski kolona yazdı → translations'ı eşitle.
        if col_val is null then
          if t ? lang then
            t := jsonb_set(t, array[lang], (t -> lang) - field);
          end if;
        else
          t := jsonb_set(t, array[lang], coalesce(t -> lang, '{}'::jsonb) || jsonb_build_object(field, col_val));
        end if;
      end if;
    end loop;
  end loop;

  new.translations := public.i18n_normalize(t);
  if column_patch <> '{}'::jsonb then
    new := jsonb_populate_record(new, column_patch);
  end if;
  return new;
end;
$$;

-- Müşteri menüsü dilleri: 'tr' zorunlu, yalnız izinli kodlar, tekrar yok.
create or replace function public.i18n_menu_languages_ok(langs text[])
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select langs is not null
    and 'tr' = any (langs)
    and cardinality(langs) between 1 and 10
    and langs <@ (array['tr']::text[] || public.i18n_allowed_languages())
    and cardinality(langs) = (select count(distinct x) from unnest(langs) as x)
$$;

-- ---------------------------------------------------------------------------
-- Kolonlar + backfill (tetikleyiciden ÖNCE; backfill doğrudan eski kolonlardan kurulur)
-- ---------------------------------------------------------------------------

alter table public.products add column if not exists translations jsonb not null default '{}'::jsonb;
alter table public.categories add column if not exists translations jsonb not null default '{}'::jsonb;
alter table public.menu_collections add column if not exists translations jsonb not null default '{}'::jsonb;
alter table public.product_variants add column if not exists translations jsonb not null default '{}'::jsonb;
alter table public.modifier_groups add column if not exists translations jsonb not null default '{}'::jsonb;
alter table public.modifier_options add column if not exists translations jsonb not null default '{}'::jsonb;

update public.products set translations = public.i18n_normalize(jsonb_build_object(
  'en', jsonb_build_object('name', name_en, 'description', description_en),
  'ru', jsonb_build_object('name', name_ru, 'description', description_ru)
))
where translations = '{}'::jsonb
  and coalesce(name_en, description_en, name_ru, description_ru) is not null;

update public.categories set translations = public.i18n_normalize(jsonb_build_object(
  'en', jsonb_build_object('name', name_en, 'main_group', main_group_en, 'note', note_en),
  'ru', jsonb_build_object('name', name_ru, 'main_group', main_group_ru, 'note', note_ru)
))
where translations = '{}'::jsonb
  and coalesce(name_en, main_group_en, note_en, name_ru, main_group_ru, note_ru) is not null;

update public.menu_collections set translations = public.i18n_normalize(jsonb_build_object(
  'en', jsonb_build_object('name', name_en),
  'ru', jsonb_build_object('name', name_ru)
))
where translations = '{}'::jsonb
  and coalesce(name_en, name_ru) is not null;

update public.product_variants set translations = public.i18n_normalize(jsonb_build_object(
  'en', jsonb_build_object('label', label_en),
  'ru', jsonb_build_object('label', label_ru)
))
where translations = '{}'::jsonb
  and coalesce(label_en, label_ru) is not null;

update public.modifier_groups set translations = public.i18n_normalize(jsonb_build_object(
  'en', jsonb_build_object('name', name_en),
  'ru', jsonb_build_object('name', name_ru)
))
where translations = '{}'::jsonb
  and coalesce(name_en, name_ru) is not null;

update public.modifier_options set translations = public.i18n_normalize(jsonb_build_object(
  'en', jsonb_build_object('name', name_en),
  'ru', jsonb_build_object('name', name_ru)
))
where translations = '{}'::jsonb
  and coalesce(name_en, name_ru) is not null;

-- ---------------------------------------------------------------------------
-- Şekil kontrolleri
-- ---------------------------------------------------------------------------

alter table public.products drop constraint if exists products_translations_chk;
alter table public.products add constraint products_translations_chk
  check (public.i18n_translations_ok(translations, array['name','description'], 4000));

alter table public.categories drop constraint if exists categories_translations_chk;
alter table public.categories add constraint categories_translations_chk
  check (public.i18n_translations_ok(translations, array['name','main_group','note'], 1000));

alter table public.menu_collections drop constraint if exists menu_collections_translations_chk;
alter table public.menu_collections add constraint menu_collections_translations_chk
  check (public.i18n_translations_ok(translations, array['name','description'], 2000));

alter table public.product_variants drop constraint if exists product_variants_translations_chk;
alter table public.product_variants add constraint product_variants_translations_chk
  check (public.i18n_translations_ok(translations, array['label'], 200));

alter table public.modifier_groups drop constraint if exists modifier_groups_translations_chk;
alter table public.modifier_groups add constraint modifier_groups_translations_chk
  check (public.i18n_translations_ok(translations, array['name'], 80));

alter table public.modifier_options drop constraint if exists modifier_options_translations_chk;
alter table public.modifier_options add constraint modifier_options_translations_chk
  check (public.i18n_translations_ok(translations, array['name'], 80));

-- ---------------------------------------------------------------------------
-- Senkron tetikleyicileri (geçiş dönemi; Faz 2.5d'de eski kolonlarla birlikte silinir)
-- ---------------------------------------------------------------------------

drop trigger if exists products_i18n_sync on public.products;
create trigger products_i18n_sync
  before insert or update of translations, name_en, name_ru, description_en, description_ru on public.products
  for each row execute function public.i18n_sync_legacy_columns('name', 'description');

drop trigger if exists categories_i18n_sync on public.categories;
create trigger categories_i18n_sync
  before insert or update of translations, name_en, name_ru, main_group_en, main_group_ru, note_en, note_ru
  on public.categories
  for each row execute function public.i18n_sync_legacy_columns('name', 'main_group', 'note');

drop trigger if exists menu_collections_i18n_sync on public.menu_collections;
create trigger menu_collections_i18n_sync
  before insert or update of translations, name_en, name_ru on public.menu_collections
  for each row execute function public.i18n_sync_legacy_columns('name');

drop trigger if exists product_variants_i18n_sync on public.product_variants;
create trigger product_variants_i18n_sync
  before insert or update of translations, label_en, label_ru on public.product_variants
  for each row execute function public.i18n_sync_legacy_columns('label');

drop trigger if exists modifier_groups_i18n_sync on public.modifier_groups;
create trigger modifier_groups_i18n_sync
  before insert or update of translations, name_en, name_ru on public.modifier_groups
  for each row execute function public.i18n_sync_legacy_columns('name');

drop trigger if exists modifier_options_i18n_sync on public.modifier_options;
create trigger modifier_options_i18n_sync
  before insert or update of translations, name_en, name_ru on public.modifier_options
  for each row execute function public.i18n_sync_legacy_columns('name');

-- ---------------------------------------------------------------------------
-- restaurants.menu_languages
-- ---------------------------------------------------------------------------

alter table public.restaurants
  add column if not exists menu_languages text[] not null default array['tr','en','ru']::text[];

alter table public.restaurants drop constraint if exists restaurants_menu_languages_chk;
alter table public.restaurants add constraint restaurants_menu_languages_chk
  check (public.i18n_menu_languages_ok(menu_languages));

comment on column public.restaurants.menu_languages is
  'Müşteri menüsünde gösterilecek diller (ilk ''tr'' ana dil). Faz 2.5.';

-- Sahip menü dillerini kendisi seçebilsin (Faz 2.5b ayarı). Liste 20261112120000 ile aynı + menu_languages.
create or replace function public.restaurants_guard_owner_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_editable text[] := array[
    'logo_url','theme_color','primary_color','secondary_color','slider_images','welcome_bg_url',
    'instagram','logo_display_mode','theme_id','font_style_id',
    'wifi_name','wifi_password','whatsapp_number','google_review_url','opening_hours','social_links','show_price_date',
    'menu_languages'
  ];
  req_role text := coalesce(auth.role(), '');
begin
  if req_role not in ('authenticated', 'anon') then
    return new;
  end if;
  if (to_jsonb(new) - owner_editable) is not distinct from (to_jsonb(old) - owner_editable) then
    return new;
  end if;
  if public.is_platform_admin() then
    return new;
  end if;
  raise exception 'Bu restoran alanlarını değiştirme yetkiniz yok.'
    using errcode = '42501';
end;
$$;
