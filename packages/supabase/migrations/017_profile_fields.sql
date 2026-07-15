-- Personal info + communication/notification preferences + agent-only
-- config, all self-service editable by the profile owner. Also closes a
-- latent privilege-escalation hole: user_profiles_update_own (001_init_schema)
-- has no `with check`, so a signed-in user could already update their own
-- `role`/`organization_name` via a direct Supabase client call. That was
-- low-risk while user_profiles had no self-service edit UI; adding one here
-- (Personal info / Settings views) makes it worth closing properly.

alter table public.user_profiles add column full_name text;
alter table public.user_profiles add column phone text;
alter table public.user_profiles
  add column contact_pref text not null default 'email'
    check (contact_pref in ('email', 'phone', 'app'));
alter table public.user_profiles
  add column best_time text not null default 'anytime'
    check (best_time in ('morning', 'afternoon', 'evening', 'anytime'));
alter table public.user_profiles
  add column notification_channels jsonb not null default '{
    "new_listing": {"email": true, "push": true},
    "price_drop": {"email": true, "push": true},
    "message": {"email": true, "push": true},
    "data_update": {"email": true, "push": true},
    "system": {"email": true, "push": true}
  }'::jsonb;

-- Agent-only config. Nullable/defaulted regardless of role — meaningful only
-- when role = 'agent', enforced at the application layer (the Settings UI
-- only renders the Agency profile card for agents), not by a DB constraint,
-- since role can change over a user's lifetime and these columns shouldn't
-- need to be wiped on a role change.
alter table public.user_profiles add column license_number text;
alter table public.user_profiles
  add column lead_routing text not null default 'roundRobin'
    check (lead_routing in ('roundRobin', 'manual'));
alter table public.user_profiles add column notify_new_lead boolean not null default true;

-- Prevent self-service escalation: block role/organization_name changes
-- from any non-service-role update. Admin role/org changes go through
-- /api/admin, which uses the service-role client and bypasses this.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.role is distinct from old.role or new.organization_name is distinct from old.organization_name then
    raise exception 'user_profiles: role and organization_name are admin-managed only';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger user_profiles_prevent_privilege_escalation
before update on public.user_profiles
for each row execute function public.prevent_profile_privilege_escalation();
