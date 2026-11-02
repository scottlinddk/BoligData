-- House search: a shared log of the individual listings a household has looked at.
-- Powers /house-search (statistics and a heatmap of where the family is searching).
--
-- Sharing model: a user belongs to at most one household. A household is created
-- with create_household() and joined with the invite code via join_household().
-- Clients never write households or household_members directly (no write policies);
-- they go through the two RPCs below, which are the only place membership changes.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- 12 hex chars from a CSPRNG (gen_random_uuid): about 48 bits, not guessable by hand.
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  -- One household per user keeps "my household" a single-row lookup.
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index household_members_household_idx on public.household_members (household_id);

create table public.house_search_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  -- DAR husnummer UUID picked from the address autocomplete.
  husnummer_id uuid not null,
  address_label text not null check (char_length(btrim(address_label)) between 1 and 200),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{4}$'),
  -- WGS84. Null when the coordinate lookup failed: the entry is still saved and
  -- counted in the statistics, it just cannot be drawn on the map.
  lat double precision check (lat is null or lat between 54.4 and 57.9),
  lon double precision check (lon is null or lon between 7.5 and 15.4),
  -- Day the household saw the listing.
  seen_at date not null default current_date,
  asking_price_dkk integer check (asking_price_dkk is null or asking_price_dkk between 1 and 200000000),
  rooms smallint check (rooms is null or rooms between 1 and 30),
  status text not null default 'interested' check (status in ('interested', 'visited', 'rejected')),
  rating smallint check (rating is null or rating between 1 and 5),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lat is null) = (lon is null)),
  -- The same house may be logged again on another day (price drop, second viewing),
  -- but not twice on the same day.
  unique (household_id, husnummer_id, seen_at)
);
create index house_search_entries_household_seen_idx on public.house_search_entries (household_id, seen_at desc);

create or replace function public.touch_house_search_entry()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger house_search_entries_touch before update on public.house_search_entries
  for each row execute function public.touch_house_search_entry();

-- Membership test used by every policy. security definer so the policy on
-- household_members can call it without recursing into itself.
create or replace function public.is_household_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.house_search_entries enable row level security;

create policy household_member_read on public.households
  for select to authenticated using (public.is_household_member(id));

create policy household_members_read on public.household_members
  for select to authenticated using (public.is_household_member(household_id));

create policy entries_member_read on public.house_search_entries
  for select to authenticated using (public.is_household_member(household_id));
create policy entries_member_insert on public.house_search_entries
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_household_member(household_id));
create policy entries_member_update on public.house_search_entries
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy entries_member_delete on public.house_search_entries
  for delete to authenticated using (public.is_household_member(household_id));

-- Creates a household and makes the caller its first member, atomically.
create or replace function public.create_household(p_name text)
returns public.households language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  created public.households;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'already in a household' using errcode = '23505';
  end if;
  insert into public.households (name, created_by) values (btrim(p_name), uid) returning * into created;
  insert into public.household_members (user_id, household_id) values (uid, created.id);
  return created;
end;
$$;

-- Joins the household that owns the invite code. Capped so a leaked code cannot
-- grow a household without bound.
create or replace function public.join_household(p_code text)
returns public.households language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  target public.households;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'already in a household' using errcode = '23505';
  end if;
  select * into target from public.households where invite_code = upper(btrim(p_code));
  if not found then raise exception 'invalid invite code' using errcode = 'P0002'; end if;
  if (select count(*) from public.household_members where household_id = target.id) >= 6 then
    raise exception 'household is full' using errcode = '54000';
  end if;
  insert into public.household_members (user_id, household_id) values (uid, target.id);
  return target;
end;
$$;

revoke all on function public.create_household(text) from public, anon;
revoke all on function public.join_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
