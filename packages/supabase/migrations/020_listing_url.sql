-- Canonical URL of the listing on the source site (boliga.dk /
-- boligsiden.dk), so the property detail page can link out to the broker's
-- own listing — the only place a buyer can see the full description, book a
-- viewing, or download the sales material.
--
-- Written by the crawl from the source record (apps/web/server/lib/crawl),
-- validated to an absolute http(s) URL on the way in: it ends up in an
-- `href`, and an unvalidated `javascript:` string from an undocumented
-- upstream API would be a stored XSS.
--
-- Nullable: sources that don't expose a usable link leave it null and the UI
-- hides the button rather than guessing a URL that 404s. Not part of
-- content_hash — it isn't enrichment input, and every crawl rewrites the
-- column regardless of whether the hash changed, so existing rows backfill
-- on the next run without forcing a full re-enrich.

alter table public.properties
  add column if not exists listing_url text;
