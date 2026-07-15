-- Buyer<->professional (agent or advisor) 1:1 messaging threads, optionally
-- scoped to a listing. Column naming (advisor_id/user_id) mirrors
-- advisor_connections: "advisor_id" is the connected professional, which in
-- practice may hold role 'agent' or 'advisor' — both share the same
-- connection model, so chat is available to either.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties (id) on delete set null,
  advisor_id uuid not null references auth.users (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  advisor_last_read_at timestamptz,
  user_last_read_at timestamptz,
  unique (advisor_id, user_id, property_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index conversations_advisor_idx on public.conversations (advisor_id, created_at desc);
create index conversations_user_idx on public.conversations (user_id, created_at desc);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- conversations: readable/insertable by either party, but only when the two
-- parties already have an advisor_connections row (mirrors
-- listing_recommendations_insert_advisor's connection check) — chat can't be
-- started with an unconnected professional.
create policy "conversations_select_party" on public.conversations
  for select using (auth.uid() = advisor_id or auth.uid() = user_id);
create policy "conversations_insert_party" on public.conversations
  for insert with check (
    (auth.uid() = advisor_id or auth.uid() = user_id)
    and exists (
      select 1 from public.advisor_connections ac
      where ac.advisor_id = conversations.advisor_id and ac.user_id = conversations.user_id
    )
  );
-- Either party can update the conversation row, but only to bump their own
-- last-read timestamp — not the other party's, and not the participants.
-- RLS `using`/`with check` can't restrict which columns change, so a
-- trigger backs this up (see prevent_conversation_repurposing below).
create policy "conversations_update_own_read_marker" on public.conversations
  for update using (auth.uid() = advisor_id or auth.uid() = user_id)
  with check (auth.uid() = advisor_id or auth.uid() = user_id);

-- Blocks any non-service-role update from changing the conversation's
-- identity (participants/property) or the other party's read marker —
-- the RLS policy above only gates *whether* a party may update a row, not
-- *which* columns, so this is the actual enforcement for "only your own
-- read marker."
create or replace function public.prevent_conversation_repurposing()
returns trigger as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.advisor_id is distinct from old.advisor_id
    or new.user_id is distinct from old.user_id
    or new.property_id is distinct from old.property_id
    or new.created_at is distinct from old.created_at then
    raise exception 'conversations: only read markers may be updated';
  end if;
  if auth.uid() = old.advisor_id and new.user_last_read_at is distinct from old.user_last_read_at then
    raise exception 'conversations: cannot update the other party''s read marker';
  end if;
  if auth.uid() = old.user_id and new.advisor_last_read_at is distinct from old.advisor_last_read_at then
    raise exception 'conversations: cannot update the other party''s read marker';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger conversations_prevent_repurposing
before update on public.conversations
for each row execute function public.prevent_conversation_repurposing();

-- messages: readable/insertable only by a party to the parent conversation;
-- insert additionally requires sender_id = the caller.
create policy "messages_select_party" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and (auth.uid() = c.advisor_id or auth.uid() = c.user_id)
    )
  );
create policy "messages_insert_party" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and (auth.uid() = c.advisor_id or auth.uid() = c.user_id)
    )
  );
