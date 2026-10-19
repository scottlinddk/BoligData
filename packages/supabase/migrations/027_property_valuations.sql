-- Public property valuations (VUR / Ejendomsvurdering) kept per property and
-- valuation year, written by scripts/backfill-bfe-valuation.mjs.
--
-- Why a table and not only enrichments.public_valuation (migration 013): the
-- sale-price / valuation ratio needs the valuation that applied around the
-- sale date, and valuations are revised on a fixed cycle (ejerboliger in odd
-- years, other property types in even years). One jsonb per property cannot
-- hold that history. enrichments.public_valuation stays untouched.
--
-- bfe_nummer is stored with each row because the BFE a valuation was fetched
-- under is not always properties.bfe_nummer: for an ejerlejlighed the script
-- resolves the unit's own BFE (BBR Ejerlejlighed), whereas properties.bfe_nummer
-- historically holds the parcel's BFE (address-lookup.ts, jordstykker).
--
-- Writes go through service_role only, same as properties/enrichments.

create table if not exists public.property_valuations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  bfe_nummer text not null check (bfe_nummer ~ '^[0-9]{1,10}$'),
  valuation_year integer not null check (valuation_year between 1990 and 2100),
  assessed_property_value_dkk bigint check (assessed_property_value_dkk > 0),
  assessed_land_value_dkk bigint check (assessed_land_value_dkk > 0),
  source text not null default 'datafordeler_vur',
  data_mode text not null default 'real' check (data_mode in ('real', 'unknown')),
  observed_at timestamptz not null default now(),
  check (assessed_property_value_dkk is not null or assessed_land_value_dkk is not null),
  unique (property_id, valuation_year)
);

create index if not exists property_valuations_bfe_year_idx
  on public.property_valuations (bfe_nummer, valuation_year);

alter table public.property_valuations enable row level security;

create policy "property_valuations_public_read" on public.property_valuations
  for select using (true);
