-- Links a 'message' notification back to the conversation it was raised
-- for, so the UI can deep-link "new message" notifications straight to the
-- thread. Deferred to its own migration since public.conversations didn't
-- exist yet when 015_generalize_notifications added the `type` column.
alter table public.notifications
  add column conversation_id uuid references public.conversations (id) on delete cascade;

create index notifications_conversation_idx on public.notifications (conversation_id);
