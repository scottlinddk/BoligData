-- Widen `notifications` from "search match only" to a general-purpose
-- in-app feed: adds a `type` discriminator plus optional title/body/link
-- fields for notification kinds that aren't tied to a saved-search match
-- (message, data update, system). search_id/property_id become nullable
-- since those only apply to the 'new_listing'/'price_drop' kinds.

alter table public.notifications
  add column type text not null default 'new_listing'
    check (type in ('new_listing', 'price_drop', 'message', 'data_update', 'system'));
alter table public.notifications add column title text;
alter table public.notifications add column body text;
alter table public.notifications add column link_path text;

alter table public.notifications alter column search_id drop not null;
alter table public.notifications alter column property_id drop not null;

-- The old blanket unique(search_id, property_id) would otherwise collide on
-- every pair of message/system rows (both columns null). Scope it to rows
-- that actually carry a search match.
alter table public.notifications drop constraint if exists notifications_search_id_property_id_key;
create unique index notifications_search_property_match_idx
  on public.notifications (search_id, property_id)
  where search_id is not null and property_id is not null;
