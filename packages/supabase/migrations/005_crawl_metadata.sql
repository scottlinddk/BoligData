-- Crawl metadata for incremental ingest (see apps/web/server/lib/crawl/ingest.ts).
--
-- content_hash: sha256 fingerprint of the listing payload as last ingested,
-- computed app-side. /api/crawl skips re-enriching listings whose hash is
-- unchanged. NULL means "never fingerprinted" and always triggers enrichment.
--
-- last_seen_at: when the crawler last saw the listing in a source feed.
-- Enables future stale-listing detection (e.g. mark withdrawn after N days).

alter table public.properties
  add column if not exists content_hash text;

alter table public.properties
  add column if not exists last_seen_at timestamptz;
