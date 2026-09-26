-- Let a saved search carry a user-drawn map area (polygon) in addition to
-- its jsonb filters, so matching properties can be found with PostGIS
-- containment queries (st_contains / st_within) against properties.location.
alter table public.searches
  add column boundary geography(Polygon, 4326);

alter table public.searches
  add constraint searches_boundary_is_valid
  check (boundary is null or st_isvalid(boundary::geometry));

create index if not exists searches_boundary_gix
  on public.searches using gist (boundary);
