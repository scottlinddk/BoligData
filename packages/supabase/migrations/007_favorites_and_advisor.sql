-- Server-backed favorites (replaces client-only localStorage), advisor<->user
-- connections, listing approvals, and agent listing linkage/promotion.

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, property_id)
);

-- Admin-assigned, many-to-many: an advisor can have many users, and a user
-- could have more than one advisor (e.g. during a handoff).
create table public.advisor_connections (
  id uuid primary key default gen_random_uuid(),
  advisor_id uuid not null references auth.users (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (advisor_id, user_id)
);

-- An advisor approving a listing for one of their connected users.
create table public.listing_approvals (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  advisor_id uuid not null references auth.users (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique (property_id, advisor_id, user_id)
);

-- Agent linkage + "skuffesalg" promotion. No RLS write policy is added here,
-- consistent with properties already being writable only via service-role.
alter table public.properties
  add column if not exists agent_user_id uuid references auth.users (id) on delete set null;
alter table public.properties
  add column if not exists is_promoted boolean not null default false;
alter table public.properties
  add column if not exists promoted_at timestamptz;
alter table public.properties
  add column if not exists promoted_by uuid references auth.users (id) on delete set null;

create index favorites_user_idx on public.favorites (user_id);
create index favorites_property_idx on public.favorites (property_id);
create index advisor_connections_advisor_idx on public.advisor_connections (advisor_id);
create index advisor_connections_user_idx on public.advisor_connections (user_id);
create index listing_approvals_user_idx on public.listing_approvals (user_id);
create index properties_agent_user_idx on public.properties (agent_user_id);
create index properties_promoted_idx on public.properties (is_promoted) where is_promoted;

alter table public.favorites enable row level security;
alter table public.advisor_connections enable row level security;
alter table public.listing_approvals enable row level security;

-- favorites: owner CRUD, plus read access for the owner's connected advisor(s).
create policy "favorites_select_own_or_advisor" on public.favorites
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.advisor_connections ac
      where ac.user_id = favorites.user_id and ac.advisor_id = auth.uid()
    )
  );
create policy "favorites_insert_own" on public.favorites
  for insert with check (auth.uid() = user_id);
create policy "favorites_delete_own" on public.favorites
  for delete using (auth.uid() = user_id);

-- advisor_connections: readable by either party; writes are admin-only
-- (service-role via /api/admin/advisor-connections).
create policy "advisor_connections_select_party" on public.advisor_connections
  for select using (auth.uid() = advisor_id or auth.uid() = user_id);

-- listing_approvals: advisor can insert/select for their own connected
-- users; the user can read approvals made for them.
create policy "listing_approvals_select_party" on public.listing_approvals
  for select using (auth.uid() = advisor_id or auth.uid() = user_id);
create policy "listing_approvals_insert_advisor" on public.listing_approvals
  for insert with check (
    auth.uid() = advisor_id
    and exists (
      select 1 from public.advisor_connections ac
      where ac.advisor_id = auth.uid() and ac.user_id = listing_approvals.user_id
    )
  );
create policy "listing_approvals_delete_advisor" on public.listing_approvals
  for delete using (auth.uid() = advisor_id);
