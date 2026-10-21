-- Regional market statistics from Danmarks Statistik (StatBank tables EJEN77
-- and EJ56), refreshed by the market-stats crawl mode
-- (server/lib/crawl/dst-stats.ts). DST publishes these per region/province and
-- quarter, not per municipality, so this complements public.market_stats
-- (Boligsiden, per municipality) instead of replacing it.
create table public.regional_market_stats (
  source text not null default 'dst',
  region_code text not null,
  region_name text not null,
  category_code text not null,
  stat_type text not null
    check (stat_type in ('avg_price', 'sales_count', 'price_change_yoy')),
  period_start date not null,
  period_end date not null,
  value numeric not null,
  prev_year_value numeric,
  fetched_at timestamptz not null default now(),
  primary key (source, region_code, category_code, stat_type, period_start)
);

alter table public.regional_market_stats enable row level security;
create policy "regional_market_stats_select_authenticated" on public.regional_market_stats
  for select to authenticated using (true);
-- Writes are service-role only, from the crawl job.
