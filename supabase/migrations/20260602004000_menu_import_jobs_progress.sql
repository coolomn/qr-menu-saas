-- PDF-3a: menu_import_jobs progress ve async altyapı kolonları.

alter table public.menu_import_jobs
  add column if not exists source_type text not null default 'image',
  add column if not exists page_count integer,
  add column if not exists pages_processed integer not null default 0,
  add column if not exists progress_phase text,
  add column if not exists progress_message text,
  add column if not exists page_payloads jsonb,
  add column if not exists openai_calls integer not null default 0,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_import_jobs_source_type_check'
      and conrelid = 'public.menu_import_jobs'::regclass
  ) then
    alter table public.menu_import_jobs
      add constraint menu_import_jobs_source_type_check
      check (source_type in ('image', 'pdf'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_import_jobs_progress_phase_check'
      and conrelid = 'public.menu_import_jobs'::regclass
  ) then
    alter table public.menu_import_jobs
      add constraint menu_import_jobs_progress_phase_check
      check (
        progress_phase is null
        or progress_phase in (
          'queued',
          'downloading',
          'rasterizing',
          'analyzing',
          'merging',
          'completed',
          'failed'
        )
      );
  end if;
end $$;

comment on column public.menu_import_jobs.source_type is 'Kaynak: image | pdf';
comment on column public.menu_import_jobs.page_count is 'PDF toplam sayfa; görsel için 1';
comment on column public.menu_import_jobs.pages_processed is 'Tamamlanan sayfa analizi sayısı';
comment on column public.menu_import_jobs.progress_phase is 'İş fazı: queued … failed';
comment on column public.menu_import_jobs.page_payloads is 'Sayfa bazlı ara AI çıktıları (async merge öncesi)';
