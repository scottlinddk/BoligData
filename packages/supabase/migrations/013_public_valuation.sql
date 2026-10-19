-- Official public property valuation (VUR/Ejendomsvurdering via
-- Datafordeler's VUR GraphQL service,
-- apps/web/server/lib/enrichment-sources/ejendomsvurdering.ts), keyed off
-- the same matrikelnr/ejerlav pair matrikel.ts already uses (migration 010).
-- A real assessed value is directly comparable to listing price.
--
-- Nullable: populated best-effort per property during ingest, same pattern
-- as bbr_data/risk_flags, never blocks the enrichment upsert when the
-- lookup fails or hasn't run yet.

alter table public.enrichments
  add column if not exists public_valuation jsonb;
