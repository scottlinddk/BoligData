-- handle_new_user() previously marked an invitation 'accepted' the moment
-- the auth.users row was created. But inviteUserByEmail() creates that row
-- at SEND time, not when the invitee actually opens the invite link — so
-- every invitation flipped to 'accepted' instantly, before the invitee had
-- done anything. Split the two: keep role-assignment at insert time, move
-- accepted-marking to the point the user's email is actually confirmed.

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
  else
    raise notice 'handle_new_user: no pending invitation found for %, defaulting role to user', new.email;
  end if;

  insert into public.user_profiles (id, role, organization_name)
  values (new.id, resolved_role, null)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Mark the matching pending invitation accepted once the invited user
-- actually confirms their email (i.e. clicks the invite link).
create or replace function public.handle_user_confirmed()
returns trigger as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.invitations
      set status = 'accepted', accepted_at = now()
      where lower(email) = lower(new.email) and status = 'pending';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
after update of email_confirmed_at on auth.users
for each row execute function public.handle_user_confirmed();
