-- Only a source-confirmed off-market address may retire a stored listing.
-- The caller has checked the live source; repeat identity/freshness validation
-- here and serialize the favorite check with concurrent favorite inserts.
create or replace function public.reconcile_off_market_property(
  p_property_id uuid,
  p_source_listing_id text,
  p_source_address_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_last_seen_at timestamptz,
  p_observed_at timestamptz,
  p_source_url text,
  p_source_reason text,
  p_dry_run boolean
) returns text
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  listing public.properties%rowtype;
  identity_count integer;
  identity_matches boolean;
  saved boolean;
  episode_id uuid;
begin
  if p_dry_run is null or p_source_reason is distinct from 'source_address_off_market'
    or p_source_address_id is null or p_source_listing_id is null
    or p_observed_at is null or p_observed_at > now() + interval '1 minute'
    or p_observed_at < now() - interval '15 minutes'
    or p_source_url is null or p_source_url !~ '^https://www[.]boligsiden[.]dk/adresse/[a-zA-Z0-9_-]+/?$'
  then
    return 'conflict';
  end if;

  if p_dry_run then
    select * into listing from public.properties where id = p_property_id;
  else
    -- The FK check for a new favorite also locks this property. A committed
    -- favorite cannot be silently cascaded away between the check and delete.
    select * into listing from public.properties where id = p_property_id for update;
  end if;
  if not found then return 'missing'; end if;
  if listing.listing_source <> 'boligsiden' or listing.data_mode not in ('real','unknown')
    or lower(listing.external_id) is distinct from lower(p_source_listing_id)
    or listing.status not in ('active','withdrawn') then
    return 'conflict';
  end if;
  if listing.updated_at is distinct from p_expected_updated_at
    or listing.last_seen_at is distinct from p_expected_last_seen_at
    or listing.updated_at > p_observed_at or listing.last_seen_at > p_observed_at then
    return 'stale';
  end if;

  -- Do not infer identity from an address label, DAR identifier, or a missing
  -- search result. Every stored verified link for this exact case must agree.
  select count(*), bool_and(coalesce(
    o.conflict_group is null and lower(o.value->>'addressId') = p_source_address_id::text, false))
    into identity_count, identity_matches
    from public.source_observations o
    where o.property_id = listing.id and o.owner_id is null and o.source = 'boligsiden'
      and o.field_name = 'source_address_id' and o.method = 'source_listing_identity'
      and o.data_mode = 'real' and o.verification_status = 'verified'
      and lower(o.value->>'sourceListingId') = lower(p_source_listing_id);
  if identity_count = 0 or identity_matches is distinct from true then return 'conflict'; end if;

  select exists(select 1 from public.favorites where property_id = listing.id) into saved;
  if p_dry_run then return case when saved then 'would_withdraw' else 'would_remove' end; end if;
  if not saved then
    -- Existing FK cascades remove listing-specific data, including unsaved
    -- assessments/history; conversations survive with a null property link.
    delete from public.properties where id = listing.id;
    return 'removed';
  end if;

  update public.properties set status = 'withdrawn' where id = listing.id and status <> 'withdrawn';
  -- A current key prevents older episodes from being rewritten. Legacy rows
  -- without a key may have only their still-open shared episodes retired.
  update public.listing_episodes e set status = 'removed', observed_at = p_observed_at
    where e.property_id = listing.id and e.owner_id is null and e.source = 'boligsiden'
      and lower(e.source_listing_id) = lower(p_source_listing_id)
      and e.data_mode in ('real','unknown') and e.status in ('active','unknown') and e.end_date is null
      and ((listing.current_episode_key is null and e.status = 'active') or e.ingest_key = listing.current_episode_key);
  select e.id into episode_id from public.listing_episodes e
    where e.property_id = listing.id and e.owner_id is null and e.source = 'boligsiden'
      and lower(e.source_listing_id) = lower(p_source_listing_id) and e.data_mode in ('real','unknown')
      and e.ingest_key = listing.current_episode_key and e.status = 'removed';
  insert into public.source_observations (
    property_id, owner_id, episode_id, ingest_key, field_name, value, source, source_url,
    observed_at, effective_date, date_precision, method, verification_status, data_mode, source_version
  ) values (
    listing.id, null, episode_id,
    'market-status:' || listing.id::text || ':' || coalesce(listing.current_episode_key, 'legacy') || ':withdrawn',
    'listing_status', jsonb_build_object('status','withdrawn','sourceListingId',p_source_listing_id,
      'sourceAddressId',p_source_address_id,'reason',p_source_reason),
    'boligsiden', p_source_url, p_observed_at, null, 'unknown',
    'source_address_market_state', 'verified', 'real', 'off-market/v1'
  ) on conflict (ingest_key) do nothing;
  return 'withdrawn';
end;
$$;

revoke all on function public.reconcile_off_market_property(uuid,text,uuid,timestamptz,timestamptz,timestamptz,text,text,boolean) from public, anon, authenticated;
grant execute on function public.reconcile_off_market_property(uuid,text,uuid,timestamptz,timestamptz,timestamptz,text,text,boolean) to service_role;
