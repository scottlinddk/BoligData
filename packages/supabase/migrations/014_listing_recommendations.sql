-- Advisor/agent -> client listing recommendations. An advisor or agent can
-- push one or more listings to one or more of their connected clients with
-- an optional message; the client can accept or dismiss each recommendation
-- and reply with their own message. Distinct from `listing_approvals`
-- (client favorites a listing, advisor stamps it "approved") — this is the
-- opposite direction: the professional initiates, the client responds.
--
-- One row per (property, recipient); `batch_id` groups the rows created by a
-- single "send to N clients" action so the UI can show them as one send even
-- though each client's accept/dismiss is tracked independently.
create table public.listing_recommendations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  advisor_id uuid not null references auth.users (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  response_message text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index listing_recommendations_user_idx on public.listing_recommendations (user_id, created_at desc);
create index listing_recommendations_user_pending_idx on public.listing_recommendations (user_id, created_at desc) where status = 'pending';
create index listing_recommendations_advisor_idx on public.listing_recommendations (advisor_id, created_at desc);
create index listing_recommendations_property_idx on public.listing_recommendations (property_id);
create index listing_recommendations_batch_idx on public.listing_recommendations (batch_id);

alter table public.listing_recommendations enable row level security;

-- Readable by either party, same shape as advisor_connections_select_party.
create policy "listing_recommendations_select_party" on public.listing_recommendations
  for select using (auth.uid() = advisor_id or auth.uid() = user_id);

-- Only the advisor/agent side of an existing connection can create a
-- recommendation for that client — mirrors listing_approvals_insert_advisor.
create policy "listing_recommendations_insert_advisor" on public.listing_recommendations
  for insert with check (
    auth.uid() = advisor_id
    and exists (
      select 1 from public.advisor_connections ac
      where ac.advisor_id = auth.uid() and ac.user_id = listing_recommendations.user_id
    )
  );

-- Only the recipient can respond (accept/dismiss + reply message).
create policy "listing_recommendations_update_recipient" on public.listing_recommendations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
