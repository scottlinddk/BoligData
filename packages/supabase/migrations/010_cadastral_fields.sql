-- Cadastral identifiers from DAWA/Adressevælger (address lookup), used to:
--  - join to other Danish registries that key off id_lokalid (BBR, Plandata)
--  - build a tinglysning.dk deep-link for the encumbrance checklist item
--    (apps/web/server/lib/enrichment-sources/tinglysning-link.ts)
--
-- All nullable: populated best-effort per property during ingest
-- (apps/web/server/lib/enrichment-sources/address-lookup.ts), never blocks
-- the property upsert when the lookup fails or hasn't run yet.

alter table public.properties
  add column if not exists id_lokalid text;

alter table public.properties
  add column if not exists matrikelnr text;

alter table public.properties
  add column if not exists ejerlav text;

alter table public.properties
  add column if not exists zone text check (zone in ('byzone', 'landzone', 'sommerhusomraade'));
