-- Boligsiden "Markedsindeks" (boligsiden.dk/markedsindeks) monthly market
-- statistics per municipality + property type, fed by the daily crawl
-- (server/lib/crawl/boligsiden-stats.ts). One row per month per stat.
create table public.market_stats (
  location_type text not null default 'municipality',
  location_name text not null,
  property_type text not null,
  stat_type text not null
    check (stat_type in ('sold_per_area_price', 'sold_time_on_market', 'sold_per_area_price_change')),
  period_start date not null,
  period_end date not null,
  value numeric not null,
  prev_month_value numeric,
  prev_year_value numeric,
  fetched_at timestamptz not null default now(),
  primary key (location_type, location_name, property_type, stat_type, period_start)
);

alter table public.market_stats enable row level security;
create policy "market_stats_select_authenticated" on public.market_stats
  for select to authenticated using (true);
-- Writes are service-role only, from the crawl job.
