-- Provenance for property_valuations, needed by the SPAR index (packages/shared/src/analysis/spar.ts).
--
-- bfe_type: which kind of BFE the valuation was fetched under. 'EL' is the unit's own
-- ejerlejlighed BFE, 'SFE' the parcel. Only 'EL' (apartments) or 'SFE' (houses) may be used
-- as the SPAR denominator, never an SFE value for an apartment sale.
--
-- registered_at: when the valuation became known to us or to VUR. Valuations are model based
-- on market sales and are published long after their valuation date, so a backtest must only
-- use valuations with registered_at <= as-of date. Null means unknown and is treated as
-- "not safe for backtests" by the SPAR code.
--
-- Correction to the comment in 027: do not assume ejerboliger are valued in odd years. The new
-- system values 2020, 2022 and 2024. valuation_year is stored exactly as returned.

alter table public.property_valuations
  add column if not exists bfe_type text check (bfe_type in ('SFE', 'EL', 'BPFG')),
  add column if not exists registered_at timestamptz;
