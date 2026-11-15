-- Faz 2.3: menü / kategori / ürün zamanlaması.
--
-- Güvenlik/uyumluluk notları:
--   * Yalnızca YENİ, boş (NULL) kolon ekler; mevcut veriye dokunmaz, hiçbir satırı silmez/değiştirmez.
--   * NULL = "her zaman" → canlı menüler bu migration sonrası değişmez.
--   * Mevcut menu_collections.start_time/end_time kolonları aynen kalır (yalnızca etiket olarak
--     okunmaya devam eder); otomatik olarak zamanlamaya ÇEVRİLMEZ, çünkü canlı menüleri
--     habersiz gizleyebilir/soluklaştırabilirdi.
--   * İçerik biçimi (starts_on, ends_on, windows[], outside) uygulama tarafında doğrulanır
--     (lib/public-menu/schedule.ts parseSchedule); geçersiz değer "her zaman" sayılır.
--     DB yalnızca nesne olmasını ve boyutu sınırlar.
--
-- Geri alma (gerekirse):
--   alter table public.menu_collections drop column schedule;
--   alter table public.categories drop column schedule;
--   alter table public.products drop column schedule;

alter table public.menu_collections add column if not exists schedule jsonb;
alter table public.categories add column if not exists schedule jsonb;
alter table public.products add column if not exists schedule jsonb;

alter table public.menu_collections drop constraint if exists menu_collections_schedule_chk;
alter table public.menu_collections
  add constraint menu_collections_schedule_chk
  check (schedule is null or (jsonb_typeof(schedule) = 'object' and pg_column_size(schedule) <= 4096));

alter table public.categories drop constraint if exists categories_schedule_chk;
alter table public.categories
  add constraint categories_schedule_chk
  check (schedule is null or (jsonb_typeof(schedule) = 'object' and pg_column_size(schedule) <= 4096));

alter table public.products drop constraint if exists products_schedule_chk;
alter table public.products
  add constraint products_schedule_chk
  check (schedule is null or (jsonb_typeof(schedule) = 'object' and pg_column_size(schedule) <= 4096));

comment on column public.menu_collections.schedule is 'Zamanlama JSON (NULL = her zaman): {starts_on, ends_on, windows:[{days,start,end}], outside:"show"|"hide"}.';
comment on column public.categories.schedule is 'Zamanlama JSON (NULL = her zaman); menu_collections.schedule ile aynı biçim.';
comment on column public.products.schedule is 'Zamanlama JSON (NULL = her zaman); menu_collections.schedule ile aynı biçim.';
