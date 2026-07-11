-- Widen roles from (investor, advisor) to (admin, user, advisor, agent), and
-- introduce invite-only signup: handle_new_user() now assigns a role from a
-- matching pending invitation instead of always hardcoding 'investor'.

alter table public.user_profiles drop constraint user_profiles_role_check;
update public.user_profiles set role = 'user' where role = 'investor';
alter table public.user_profiles
  add constraint user_profiles_role_check check (role in ('admin', 'user', 'advisor', 'agent'));
alter table public.user_profiles alter column role set default 'user';

-- invitations: admin-created, consumed by handle_new_user() at signup time.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('admin', 'user', 'advisor', 'agent')),
  invited_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Only one pending invitation per email at a time; a revoked or accepted
-- invitation doesn't block re-inviting the same address later.
create unique index invitations_pending_email_idx on public.invitations (lower(email)) where status = 'pending';
create index invitations_email_idx on public.invitations (lower(email));

-- Look up a pending invitation by email and assign its role; mark it
-- accepted. Defensive fallback to 'user' if none is found (shouldn't happen
-- once signup is invite-only) rather than failing the auth trigger.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  matched_invitation public.invitations%rowtype;
  resolved_role text := 'user';
begin
  select * into matched_invitation
    from public.invitations
    where lower(email) = lower(new.email) and status = 'pending'
    order by invited_at desc
    limit 1;

  if found then
    resolved_role := matched_invitation.role;
    update public.invitations
      set status = 'accepted', accepted_at = now()
      where id = matched_invitation.id;
  else
    raise notice 'handle_new_user: no pending invitation found for %, defaulting role to user', new.email;
  end if;

  insert into public.user_profiles (id, role, organization_name)
  values (new.id, resolved_role, null)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

alter table public.invitations enable row level security;
-- No policies: deny-all for anon/authenticated. Only ever touched via the
-- service-role client from /api/admin/invitations.
