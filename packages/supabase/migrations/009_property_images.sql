-- Replace the flat image_urls text[] with structured per-image data (see
-- packages/shared/src/types/index.ts ListingImage): category (photo/
-- floorplan/other) plus whatever pre-sized source variants the crawl source
-- provides, so the UI can request a specific size instead of one fixed URL.

alter table public.properties
  add column if not exists images jsonb not null default '[]';

alter table public.properties
  drop column if exists image_urls;
