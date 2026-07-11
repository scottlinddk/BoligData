-- Per-user, per-matched-listing in-app notification feed. Separate from
-- `alerts` (which stays the per-batch email-send audit log): this table is
-- the shape the bell/feed UI needs (mark a single match as read), while
-- `alerts` records one row per email attempt for a saved search.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  search_id uuid not null references public.searches (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  alert_id uuid references public.alerts (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (search_id, property_id)
);

create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id);
-- Inserts are service-role only, from the notify cron job.
