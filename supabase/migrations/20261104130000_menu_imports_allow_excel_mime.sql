-- Excel içe aktarma (lib/menu-import/mime.ts isExcelMime) storage bucket'ında hiç izinli değildi;
-- staging'de "mime type ... spreadsheetml.sheet is not supported" hatasıyla yükleme reddediliyordu.
-- İdempotent: mevcut listeye yalnızca eksik Excel türlerini ekler, diğerlerine dokunmaz.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m order by m)
  from unnest(
    coalesce(allowed_mime_types, array[]::text[]) || array[
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/excel',
      'application/x-excel',
      'application/x-msexcel'
    ]
  ) as m
)
where id = 'menu-imports'
  and allowed_mime_types is not null;

-- Geri alma:
-- update storage.buckets
-- set allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp','image/gif']
-- where id = 'menu-imports';
