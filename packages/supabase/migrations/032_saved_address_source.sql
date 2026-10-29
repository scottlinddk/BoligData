-- Properties are now addresses a user saved or looked up, not scraped listings.
-- Allow the new listing_source value. The old values stay allowed so this applies
-- over existing rows; the Boligsiden purge narrows the constraint afterwards.
alter table public.properties drop constraint if exists properties_listing_source_check;
alter table public.properties add constraint properties_listing_source_check
  check (listing_source in ('boligsiden', 'boliga', 'saved_address'));
