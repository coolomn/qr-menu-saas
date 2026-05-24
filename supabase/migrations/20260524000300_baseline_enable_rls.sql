-- Baseline RLS activation for core tenant tables.
-- Policies are intentionally not defined in this step.

alter table public.restaurants enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
