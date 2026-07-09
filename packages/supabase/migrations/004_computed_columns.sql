-- Stored generated column so price/sqm can be filtered and sorted in SQL
-- directly, instead of being approximated in application code.
alter table public.properties
  add column price_per_sqm numeric generated always as (price / nullif(sqm, 0)) stored;

create index if not exists properties_price_per_sqm_idx on public.properties (price_per_sqm);
