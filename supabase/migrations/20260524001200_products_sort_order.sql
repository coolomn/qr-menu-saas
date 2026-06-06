-- Ürün sıralaması: kategori içinde sort_order ile yönetilir.
alter table public.products
  add column if not exists sort_order integer not null default 0;

create index if not exists products_category_sort_order_idx
  on public.products (category_id, sort_order);

with ranked as (
  select
    id,
    row_number() over (partition by category_id order by created_at asc) - 1 as rn
  from public.products
)
update public.products p
set sort_order = ranked.rn
from ranked
where p.id = ranked.id;
