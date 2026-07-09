-- Geospatial index for map/distance queries
create index if not exists properties_location_gix on public.properties using gist (location);

-- Common filter/sort columns
create index if not exists properties_listing_date_idx on public.properties (listing_date);
create index if not exists properties_status_idx on public.properties (status);
create index if not exists properties_municipality_idx on public.properties (municipality);

-- Foreign-key lookups
create index if not exists searches_user_id_idx on public.searches (user_id);
create index if not exists alerts_search_id_idx on public.alerts (search_id);
create index if not exists enrichments_property_id_idx on public.enrichments (property_id);
