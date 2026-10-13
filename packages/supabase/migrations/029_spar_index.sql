-- Own SPAR price index (value-weighted sale price / public valuation) and DST benchmark series.
--
-- spar_index_vintages keeps every run so revisions are visible. Months younger than 13
-- months are preliminary, the same convention DST uses.
-- dst_series holds benchmark values fetched from Statistikbanken (for example EJ56). It is
-- never filled with interpolated values.

create table if not exists public.spar_index_vintages (
  run_at timestamptz not null default now(),
  period text not null check (period ~ '^[0-9]{4}-([0-9]{2}|Q[1-4])$'),
  granularity text not null check (granularity in ('month', 'quarter')),
  segment text not null,
  method text not null check (method in ('ratio_of_sums', 'state_space')),
  estimate numeric not null,
  lo80 numeric,
  hi80 numeric,
  lo95 numeric,
  hi95 numeric,
  n_sales integer not null check (n_sales >= 0),
  preliminary boolean not null default true,
  primary key (run_at, period, granularity, segment, method)
);

create table if not exists public.dst_series (
  table_id text not null,
  area text not null,
  property_category text not null,
  unit text not null,
  period text not null,
  value numeric not null,
  fetched_at timestamptz not null default now(),
  primary key (table_id, area, property_category, unit, period)
);

alter table public.spar_index_vintages enable row level security;
alter table public.dst_series enable row level security;

create policy "spar_index_vintages_public_read" on public.spar_index_vintages for select using (true);
create policy "dst_series_public_read" on public.dst_series for select using (true);
