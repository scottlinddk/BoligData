-- PostGIS is installed in public by 001_init_schema.sql (also pinned by 003).
-- Match the coarse index and exact coverage in longitude/latitude geometry. A geography
-- bbox follows great-circle arcs and is not a safe superset of a map's straight polygon.
-- The existing geography index remains available for distance-based queries.
create index if not exists idx_properties_location_geometry
  on public.properties using gist ((location::public.geometry))
  where location is not null;

-- Exact coverage includes polygon edges and vertices.
create or replace function public.properties_in_boundary(boundary jsonb)
returns setof public.properties
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  vertices jsonb := boundary;
  vertex jsonb;
  vertex_count integer;
  longitude numeric;
  latitude numeric;
  boundary_geometry public.geometry;
begin
  if vertices is null or jsonb_typeof(vertices) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid search boundary';
  end if;
  vertex_count := jsonb_array_length(vertices);
  if vertex_count < 3 or vertex_count > 65 then
    raise exception using errcode = '22023', message = 'Search boundary needs 3 to 64 distinct vertices';
  end if;
  for vertex in select value from jsonb_array_elements(vertices) loop
    if jsonb_typeof(vertex) <> 'array' then
      raise exception using errcode = '22023', message = 'Boundary vertices must be longitude/latitude pairs';
    end if;
    if jsonb_array_length(vertex) <> 2 or jsonb_typeof(vertex -> 0) <> 'number' or jsonb_typeof(vertex -> 1) <> 'number' then
      raise exception using errcode = '22023', message = 'Boundary coordinates must be finite numbers';
    end if;
    longitude := (vertex ->> 0)::numeric;
    latitude := (vertex ->> 1)::numeric;
    if longitude < -180 or longitude > 180 or latitude < -90 or latitude > 90 then
      raise exception using errcode = '22023', message = 'Boundary coordinates are out of range';
    end if;
  end loop;
  if vertices -> 0 = vertices -> (vertex_count - 1) then
    vertices := vertices - (vertex_count - 1);
    vertex_count := vertex_count - 1;
  end if;
  if vertex_count < 3 or vertex_count > 64 or (select count(distinct value) from jsonb_array_elements(vertices)) <> vertex_count then
    raise exception using errcode = '22023', message = 'Search boundary needs 3 to 64 distinct vertices';
  end if;
  -- Local map geometry has no date-line wrapping.
  if (select max((value ->> 0)::numeric) - min((value ->> 0)::numeric) from jsonb_array_elements(vertices)) >= 180 then
    raise exception using errcode = '22023', message = 'Search boundary must be a local area';
  end if;
  boundary_geometry := public.st_setsrid(public.st_geomfromgeojson(jsonb_build_object(
    'type', 'Polygon', 'coordinates', jsonb_build_array(vertices || jsonb_build_array(vertices -> 0))
  )), 4326);
  if not public.st_isvalid(boundary_geometry) or public.st_area(boundary_geometry) <= 0 then
    raise exception using errcode = '22023', message = 'Search boundary must be a simple non-empty polygon';
  end if;
  return query
    select p.*
    from public.properties p
    where p.location is not null
      and p.location::public.geometry operator(public.&&) boundary_geometry
      and public.st_covers(boundary_geometry, p.location::public.geometry);
end;
$$;

comment on function public.properties_in_boundary(jsonb) is
  'Validated drawn-area property search. SECURITY INVOKER preserves table RLS; API selects caller-appropriate columns and applies filters, ordering, exact counts and pagination.';
revoke all on function public.properties_in_boundary(jsonb) from public;
grant execute on function public.properties_in_boundary(jsonb) to anon, authenticated, service_role;
