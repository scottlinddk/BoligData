-- Run only against a disposable empty PostgreSQL/PostGIS database, for example in CI:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify-search-boundary.sql
-- All fixture/migration changes roll back. The guard prevents use on an existing app database.
\set ON_ERROR_STOP on
begin;
do $$
begin
  if to_regclass('public.properties') is not null or to_regclass('public.searches') is not null then
    raise exception 'Boundary verification requires an empty disposable database';
  end if;
end;
$$;

create extension if not exists postgis with schema public;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end;
$$;

create table public.searches (
  id integer primary key,
  filters jsonb not null default '{}'::jsonb
);
insert into public.searches (id) values (1);

create table public.properties (
  id uuid primary key,
  address text not null,
  price numeric not null,
  status text not null default 'active',
  location public.geography(Point, 4326),
  visible boolean not null default true
);
alter table public.properties enable row level security;
create policy fixture_visibility on public.properties for select to anon, authenticated using (visible);
grant usage on schema public to anon, authenticated, service_role;
grant select on public.properties to anon, authenticated, service_role;

-- A concave ring has a notch: (9.5,57.8) is inside its rectangle but outside the polygon.
insert into public.properties (id, address, price, location, visible) values
  ('00000000-0000-0000-0000-000000000001', 'Vertex', 100, public.st_point(9, 57, 4326)::public.geography, true),
  ('00000000-0000-0000-0000-000000000002', 'Edge', 200, public.st_point(9.5, 57, 4326)::public.geography, true),
  ('00000000-0000-0000-0000-000000000003', 'Interior', 300, public.st_point(9.5, 57.25, 4326)::public.geography, true),
  ('00000000-0000-0000-0000-000000000004', 'Notch', 400, public.st_point(9.5, 57.8, 4326)::public.geography, true),
  ('00000000-0000-0000-0000-000000000005', 'Outside', 500, public.st_point(8.8, 57.5, 4326)::public.geography, true),
  ('00000000-0000-0000-0000-000000000006', 'Unlocated', 600, null, true),
  ('00000000-0000-0000-0000-000000000007', 'RLS hidden', 700, public.st_point(9.6, 57.25, 4326)::public.geography, false);

\ir ../packages/supabase/migrations/024_drawn_search_boundary.sql
\ir ../packages/supabase/migrations/025_property_search_boundary.sql

-- The existing saved-search schema and the new property RPC must coexist.
do $$
begin
  if not exists (select 1 from public.searches where id = 1 and boundary is null and filters = '{}'::jsonb) then
    raise exception 'Boundary migration changed an existing saved search';
  end if;
  if to_regclass('public.searches_boundary_gix') is null or to_regclass('public.idx_properties_location_geometry') is null then
    raise exception 'Both saved-search and property geometry indexes are required';
  end if;
  update public.searches
    set boundary = public.st_geomfromtext('POLYGON((9 57,10 57,10 58,9 58,9 57))', 4326)::public.geography
    where id = 1;
  if not exists (select 1 from public.searches where id = 1 and public.st_isvalid(boundary::public.geometry)) then
    raise exception 'Saved-search boundary did not retain a valid polygon';
  end if;
  begin
    update public.searches
      set boundary = public.st_geomfromtext('POLYGON((9 57,10 58,9 58,10 57,9 57))', 4326)::public.geography
      where id = 1;
    raise exception 'Saved-search boundary accepted a self-intersecting polygon';
  exception when check_violation then
    null;
  end;
end;
$$;

do $$
declare
  ring jsonb := '[[9,57],[10,57],[10,58],[9.5,57.5],[9,58]]';
  matching_ids uuid[];
  closed_ids uuid[];
begin
  select array_agg(id order by id) into matching_ids from public.properties_in_boundary(ring);
  if matching_ids is distinct from array[
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000007'::uuid
  ] then raise exception 'Incorrect geometry coverage: %', matching_ids; end if;
  select array_agg(id order by id) into closed_ids from public.properties_in_boundary(ring || '[ [9,57] ]'::jsonb);
  if closed_ids is distinct from matching_ids then raise exception 'Optional ring closure changed coverage'; end if;
  if not exists (select 1 from pg_proc where oid = 'public.properties_in_boundary(jsonb)'::regprocedure and not prosecdef and provolatile = 's') then
    raise exception 'Boundary RPC must be STABLE SECURITY INVOKER';
  end if;
end;
$$;

create function pg_temp.expect_invalid_boundary(candidate jsonb) returns void language plpgsql as $$
begin
  perform * from public.properties_in_boundary(candidate);
  raise exception 'Expected invalid boundary rejection for %', candidate;
exception when sqlstate '22023' then
  return;
end;
$$;
select pg_temp.expect_invalid_boundary(null);
select pg_temp.expect_invalid_boundary('null');
select pg_temp.expect_invalid_boundary('{}');
select pg_temp.expect_invalid_boundary('[]');
select pg_temp.expect_invalid_boundary('[[9,57],[10,57]]');
select pg_temp.expect_invalid_boundary('[["9",57],[10,57],[10,58]]');
select pg_temp.expect_invalid_boundary('[[9,57,1],[10,57],[10,58]]');
select pg_temp.expect_invalid_boundary('[[9,91],[10,57],[10,58]]');
select pg_temp.expect_invalid_boundary('[[181,57],[10,57],[10,58]]');
select pg_temp.expect_invalid_boundary('[[9,57],[9.5,57.5],[10,58]]');
select pg_temp.expect_invalid_boundary('[[9,57],[10,58],[9,58],[10,57]]');
select pg_temp.expect_invalid_boundary('[[9,57],[10,57],[10,58],[9,57],[9,58]]');
select pg_temp.expect_invalid_boundary('[[9,57],[10,57],[9.5,57],[10,58],[9,58]]');
select pg_temp.expect_invalid_boundary('[[-179,55],[179,55],[179,57],[-179,57]]');
select pg_temp.expect_invalid_boundary((select jsonb_agg(jsonb_build_array(9 + cos(i * 2 * pi() / 65), 57 + sin(i * 2 * pi() / 65))) from generate_series(0,64) as i));
do $$
declare
  ring jsonb;
begin
  select jsonb_agg(jsonb_build_array(9 + cos(i * 2 * pi() / 64), 57 + sin(i * 2 * pi() / 64)) order by i) into ring from generate_series(0,63) as i;
  perform * from public.properties_in_boundary(ring);
  perform * from public.properties_in_boundary(ring || jsonb_build_array(ring -> 0));
end;
$$;

-- RLS must still apply inside the RPC, including when the API only projects id/address.
set local role anon;
do $$
declare
  ring jsonb := '[[9,57],[10,57],[10,58],[9.5,57.5],[9,58]]';
  total integer;
  second_page_address text;
begin
  select count(*) into total from public.properties_in_boundary(ring);
  if total <> 3 then raise exception 'Anonymous RLS did not hide the private fixture row: %', total; end if;
  select address into second_page_address from public.properties_in_boundary(ring) where status = 'active' and price >= 200 order by price desc limit 1 offset 1;
  if second_page_address is distinct from 'Edge' then raise exception 'Boundary must compose with filters, sorting and pagination'; end if;
  select count(*) into total from public.properties_in_boundary(ring) where price >= 200;
  if total <> 2 then raise exception 'Filtered count must precede pagination'; end if;
end;
$$;
reset role;
set local role authenticated;
do $$
begin
  if (select count(*) from public.properties_in_boundary('[[9,57],[10,57],[10,58],[9.5,57.5],[9,58]]')) <> 3 then
    raise exception 'Authenticated RLS did not apply inside the RPC';
  end if;
end;
$$;
reset role;
rollback;
\echo 'Drawn-boundary migrations, saved-search storage, geometry, input validation, RLS and pagination checks passed.'
