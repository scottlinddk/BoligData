-- Pin search_path on the trigger function (advisor: function_search_path_mutable)
create or replace function public.set_property_location()
returns trigger as $$
begin
  new.location := st_setsrid(st_makepoint(new.lon, new.lat), 4326)::geography;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql set search_path = public;

-- handle_new_user is only meant to run as an auth.users trigger, not to be
-- called directly via /rest/v1/rpc/handle_new_user (advisor: anon/authenticated
-- security_definer_function_executable)
revoke execute on function public.handle_new_user() from anon, authenticated;

-- Note: public.spatial_ref_sys (a PostGIS system table, advisor:
-- rls_disabled_in_public) is owned by the extension/postgres role, not the
-- project owner, so RLS can't be enabled on it from this session
-- ("must be owner of table spatial_ref_sys"). This is a well-known,
-- commonly-accepted PostGIS-on-Supabase limitation with no per-row
-- ownership semantics to protect in the first place.
