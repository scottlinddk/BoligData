-- Singleton site-wide config, currently just the admin "show system banner
-- to all users" toggle. Single-row-by-design: id is a boolean PK pinned to
-- true, so a second row is structurally impossible.
create table public.app_settings (
  id boolean primary key default true check (id),
  broadcast_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true);

alter table public.app_settings enable row level security;

-- Public read (the banner must render for signed-out users too); writes are
-- service-role only, via /api/admin.
create policy "app_settings_public_read" on public.app_settings
  for select using (true);
