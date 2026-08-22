-- Persists the BFE-nummer (Bestemt Fast Ejendom) resolved per property during
-- ingest (apps/web/server/lib/enrichment-sources/address-lookup.ts) — the
-- identifier VUR indexes valuations by, and the ChatGPT-plan reconciliation's
-- adopted first step toward BFE as a stored, queryable property identity
-- (see docs/chatgpt-plan-reconciliation.md). Follows the same pattern as
-- migration 010_cadastral_fields.sql: nullable, populated best-effort, never
-- blocks the property upsert when the lookup fails or hasn't run yet.

alter table public.properties
  add column if not exists bfe_nummer text;

create index if not exists properties_bfe_nummer_idx on public.properties (bfe_nummer);
