-- Extensions
create extension if not exists pgcrypto;
create extension if not exists postgis;

-- user_profiles: 1:1 with auth.users, extra app-level fields
create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'investor' check (role in ('investor', 'advisor')),
  organization_name text,
  created_at timestamptz not null default now()
);

-- properties: listings ingested from Boligsiden/Boliga
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  municipality text not null,
  postal_code text,
  price numeric not null,
  sqm numeric not null,
  listing_date date not null,
  listing_source text not null check (listing_source in ('boligsiden', 'boliga')),
  external_id text not null,
  lat double precision not null,
  lon double precision not null,
  location geography(Point, 4326),
  status text not null default 'active' check (status in ('active', 'sold', 'withdrawn')),
  building_year int,
  property_type text not null default 'other'
    check (property_type in ('villa', 'apartment', 'terraced_house', 'summer_house', 'farm', 'other')),
  rooms int,
  image_urls text[] not null default '{}',
  description text,
  agent_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_source, external_id)
);

-- Derive geography(Point) from lat/lon so callers never construct it by hand.
create or replace function public.set_property_location()
returns trigger as $$
begin
  new.location := st_setsrid(st_makepoint(new.lon, new.lat), 4326)::geography;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger properties_set_location
before insert or update on public.properties
for each row execute function public.set_property_location();

-- enrichments: BBR/OIS/risk-flag data, one row per property
create table public.enrichments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  bbr_data jsonb not null default '{}'::jsonb,
  sold_price_history jsonb not null default '[]'::jsonb,
  calculated_metrics jsonb not null default '{}'::jsonb,
  risk_flags jsonb not null default '{}'::jsonb,
  school_transport jsonb,
  source text not null default 'mock' check (source in ('mock', 'datafordeler', 'ois', 'vejdirektoratet')),
  enriched_at timestamptz not null default now(),
  unique (property_id)
);

-- searches: user-saved filter criteria + alert preference
create table public.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  alert_frequency text not null default 'none'
    check (alert_frequency in ('none', 'immediate', 'daily', 'weekly')),
  created_at timestamptz not null default now(),
  last_alert_at timestamptz
);

-- alerts: log of alert emails sent for a saved search
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.searches (id) on delete cascade,
  sent_at timestamptz not null default now(),
  property_ids uuid[] not null default '{}',
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed'))
);

-- Auto-create a user_profiles row when someone signs up via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, role, organization_name)
  values (new.id, 'investor', null)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.user_profiles enable row level security;
alter table public.properties enable row level security;
alter table public.enrichments enable row level security;
alter table public.searches enable row level security;
alter table public.alerts enable row level security;

create policy "user_profiles_select_own" on public.user_profiles
  for select using (auth.uid() = id);
create policy "user_profiles_insert_own" on public.user_profiles
  for insert with check (auth.uid() = id);
create policy "user_profiles_update_own" on public.user_profiles
  for update using (auth.uid() = id);

-- properties/enrichments are public read; writes go through service_role only
-- (which bypasses RLS), so no insert/update/delete policies are defined here.
create policy "properties_public_read" on public.properties
  for select using (true);
create policy "enrichments_public_read" on public.enrichments
  for select using (true);

create policy "searches_select_own" on public.searches
  for select using (auth.uid() = user_id);
create policy "searches_insert_own" on public.searches
  for insert with check (auth.uid() = user_id);
create policy "searches_update_own" on public.searches
  for update using (auth.uid() = user_id);
create policy "searches_delete_own" on public.searches
  for delete using (auth.uid() = user_id);

create policy "alerts_select_own" on public.alerts
  for select using (
    exists (
      select 1 from public.searches s
      where s.id = alerts.search_id and s.user_id = auth.uid()
    )
  );
