-- Registered land area (registreretAreal) for the property's parcel, from
-- Matriklen GraphQL's Jordstykke entity
-- (apps/web/server/lib/enrichment-sources/matrikel.ts), joined via the
-- matrikelnr/ejerlav pair already populated by address-lookup.ts
-- (migration 010). A stronger due-diligence signal for lot size than
-- back-calculating from the listing's building sqm.
--
-- Nullable: populated best-effort per property during ingest, never blocks
-- the property upsert when the lookup fails or hasn't run yet.

alter table public.properties
  add column if not exists registered_area_sqm numeric;
