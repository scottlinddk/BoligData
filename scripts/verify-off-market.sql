-- Disposable PostgreSQL only. Every fixture/migration change rolls back.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify-off-market.sql
\set ON_ERROR_STOP on
begin;
do $$ begin
  if to_regclass('public.properties') is not null then
    raise exception 'Off-market verification requires an empty disposable database';
  end if;
end; $$;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end; $$;

create table public.properties (
  id uuid primary key, listing_source text default 'boligsiden', external_id text not null,
  status text default 'active', data_mode text default 'real', current_episode_key text default 'current',
  updated_at timestamptz default '2026-01-01T00:00:00Z', last_seen_at timestamptz default '2026-01-01T00:00:00Z'
);
create function public.test_property_timestamp() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
create trigger property_timestamp before update on public.properties
  for each row execute function public.test_property_timestamp();
create table public.favorites (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  property_id uuid not null references public.properties(id) on delete cascade
);
create table public.listing_episodes (
  id uuid primary key default gen_random_uuid(), property_id uuid references public.properties(id) on delete cascade,
  owner_id uuid, source text default 'boligsiden', source_listing_id text, ingest_key text unique,
  status text default 'active', end_date date, observed_at timestamptz default '2026-01-01T00:00:00Z', data_mode text default 'real'
);
create table public.source_observations (
  id uuid primary key default gen_random_uuid(), property_id uuid references public.properties(id) on delete cascade,
  owner_id uuid, episode_id uuid references public.listing_episodes(id) on delete set null,
  ingest_key text unique, field_name text, value jsonb, source text, source_url text,
  observed_at timestamptz, effective_date date, date_precision text, method text,
  verification_status text, data_mode text, source_version text, conflict_group text
);
alter table public.favorites enable row level security;
create policy own_favorites on public.favorites to authenticated using
  (user_id = nullif(current_setting('request.jwt.claim.sub',true),'')::uuid);
grant usage on schema public to anon, authenticated, service_role;
grant select,insert,update,delete on all tables in schema public to service_role;
grant select on public.favorites to authenticated;

\ir ../packages/supabase/migrations/026_off_market_properties.sql

insert into public.properties(id,external_id)
  select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
    '99999999-9999-4999-8999-999999999999' from generate_series(1,5) n;
insert into public.source_observations(property_id,field_name,value,source,method,data_mode,verification_status)
  select id,'source_address_id','{"addressId":"88888888-8888-4888-8888-888888888888","sourceListingId":"99999999-9999-4999-8999-999999999999"}',
    'boligsiden','source_listing_identity','real','verified' from public.properties;
insert into public.favorites(property_id,user_id) values
  ('00000000-0000-4000-8000-000000000002','77777777-7777-4777-8777-777777777777');
insert into public.listing_episodes(property_id,source_listing_id,ingest_key) values
  ('00000000-0000-4000-8000-000000000002','99999999-9999-4999-8999-999999999999','current'),
  ('00000000-0000-4000-8000-000000000002','99999999-9999-4999-8999-999999999999','older');
insert into public.listing_episodes(property_id,source_listing_id,ingest_key,owner_id) values
  ('00000000-0000-4000-8000-000000000002','99999999-9999-4999-8999-999999999999','private','77777777-7777-4777-8777-777777777777');
update public.properties set updated_at = now() where id = '00000000-0000-4000-8000-000000000003';
update public.source_observations set conflict_group = 'identity_conflict' where property_id = '00000000-0000-4000-8000-000000000004';
update public.properties set status = 'sold' where id = '00000000-0000-4000-8000-000000000005';

-- Test shorthand uses known fixture snapshots, never the production schema.
create function public.test_retire(n integer, dry boolean default false, reason text default 'source_address_off_market',
  seen timestamptz default now(), expected_updated timestamptz default '2026-01-01T00:00:00Z')
returns text language sql security invoker as $$
  select public.reconcile_off_market_property(
    ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
    '99999999-9999-4999-8999-999999999999','88888888-8888-4888-8888-888888888888',
    expected_updated,'2026-01-01T00:00:00Z',seen,
    'https://www.boligsiden.dk/adresse/example',reason,dry
  );
$$;

set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$ begin
  if (select count(*) from public.favorites) <> 0 then raise exception 'Favorite fixture is not private'; end if;
  begin
    perform public.test_retire(1);
    raise exception 'Authenticated caller must not retire listings';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.test_retire(1);
    raise exception 'Anonymous caller must not retire listings';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

set local role service_role;
do $$ begin
  if public.test_retire(1,true) <> 'would_remove' then raise exception 'Unsaved dry-run failed'; end if;
  if public.test_retire(2,true) <> 'would_withdraw' then raise exception 'Cross-user favorite not protected'; end if;
  if (select count(*) from public.properties) <> 5 or exists(select 1 from public.properties where status='withdrawn')
    or (select count(*) from public.source_observations) <> 5 then raise exception 'Dry run mutated data'; end if;
  if public.test_retire(1,false,'source_case_absent_from_current_postcode_feed') <> 'conflict' then raise exception 'Feed absence accepted'; end if;
  if public.test_retire(1,false,'source_address_off_market',now()-interval '1 hour') <> 'conflict' then raise exception 'Old source evidence accepted'; end if;
  if public.test_retire(1,false,'source_address_off_market',now()+interval '1 hour') <> 'conflict' then raise exception 'Future source evidence accepted'; end if;
  if public.test_retire(3) <> 'stale' then raise exception 'Newer property update overwritten'; end if;
  update public.properties set last_seen_at=now() where id='00000000-0000-4000-8000-000000000003';
  if public.test_retire(3,false,'source_address_off_market',now(),now()) <> 'stale' then raise exception 'Newer active source observation overwritten'; end if;
  if public.test_retire(4) <> 'conflict' then raise exception 'Ambiguous address identity accepted'; end if;
  if public.test_retire(5) <> 'conflict' then raise exception 'Sold status overwritten'; end if;
  if public.test_retire(2) <> 'withdrawn' then raise exception 'Favorite not retained'; end if;
  if (select status from public.properties where id='00000000-0000-4000-8000-000000000002') <> 'withdrawn'
    or (select count(*) from public.favorites) <> 1 then raise exception 'Favorite or property lost'; end if;
  if (select status from public.listing_episodes where ingest_key='current') <> 'removed'
    or exists(select 1 from public.listing_episodes where end_date is not null)
    or exists(select 1 from public.listing_episodes where ingest_key in ('older','private') and status <> 'active')
    then raise exception 'Incorrect episode or invented removal date'; end if;
  if not exists(select 1 from public.source_observations where field_name='listing_status'
    and value->>'status'='withdrawn' and verification_status='verified' and effective_date is null
    and episode_id=(select id from public.listing_episodes where ingest_key='current')) then raise exception 'Missing source status evidence'; end if;
  if public.test_retire(2) <> 'stale' then raise exception 'Old snapshot reused after withdrawal'; end if;
  if public.test_retire(2,false,'source_address_off_market',now(),now()) <> 'withdrawn'
    or (select count(*) from public.source_observations where field_name='listing_status') <> 1
    then raise exception 'Repeat retirement not idempotent'; end if;
  if public.test_retire(1) <> 'removed' then raise exception 'Unsaved listing not removed'; end if;
  if exists(select 1 from public.properties where id='00000000-0000-4000-8000-000000000001')
    or exists(select 1 from public.source_observations where property_id='00000000-0000-4000-8000-000000000001')
    then raise exception 'Unsaved listing or cascading source data not removed'; end if;
  if public.test_retire(1) <> 'missing' then raise exception 'Deleted retry incorrect'; end if;
  delete from public.favorites where property_id='00000000-0000-4000-8000-000000000002';
  if public.test_retire(2,false,'source_address_off_market',now(),now()) <> 'removed' then raise exception 'Unfavorited withdrawn listing was not removed'; end if;
end; $$;
reset role;
rollback;
\echo 'Off-market RPC: service-only access, cross-user favorites, source identity/freshness, dry run, retention and removal passed.'
