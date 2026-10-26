# Parcel owner map (`/map`)

Signed-in users get a full-page map of cadastral parcels. Zoom to street level (zoom 16+), click a parcel and a card shows its registered owner. Parcel numbers are drawn from zoom 17.

## API (inside `api/properties.ts`, no new Vercel function)

- `GET /api/properties?resource=parcels&bbox=minLon,minLat,maxLon,maxLat` returns parcel geometry as WGS84 GeoJSON plus the BFE of each parcel. The box must be inside Denmark and at most 0.012° tall and 0.024° wide, and at most 400 parcels are returned (`truncated` says if more existed). Geometry only, so it does not use the register quota.
- `GET /api/properties?resource=parcel-owner&bfe=<BFE>` returns owners through the existing Matriklen `BfeEjer` adapter. It spends one `consume_register_lookup_budget` unit (30 per hour per account) and answers `429` with `Retry-After` when spent. Protected persons stay redacted, and no CPR number or home address is returned.

Both require sign-in and respond `private, no-store`. The client caches owners for ten minutes, so re-clicking a parcel does not spend another lookup.

## Mock mode and what is not verified

`PARCEL_MAP_MOCK_MODE` defaults to `true`, like the crawl/enrichment flags: the map serves two fictitious parcels with no BFE and never queries a register. Set it to `false` with `DATAFORDELER_API_KEY` to use the real source.

**The parcel query is checked against the published schema, not yet against the live service.** `geometriIBoundingBox` never existed: `MAT_Jordstykke` has no geometry filter. `parcelsQuery()` in `server/lib/parcel-map/source.ts` now filters `MAT_Lodflade` with `geometri: {intersects: {wkt, crs: 25832}}` (the box projected to a UTM32 polygon), then joins `MAT_Jordstykke`, `MAT_SamletFastEjendom` and `MAT_Ejerlav` by `id_lokalId` (max 100 ids per `in`). Field and filter names come from https://datafordeler.dk/GraphQLSchema/MAT.graphql; the status values and query-cost limits are untested. Check the first live response in the `[parcel-map] unavailable:` log. Any GraphQL error or malformed node makes the endpoint answer `status: "unavailable"` (the map shows a notice), never partial data.

Also unchecked: the map UI has been type-checked but not exercised in a browser.
