# Address lookup (homes that are not for sale)

Signed-in users can open **Slå adresse op** (`/address`), pick any Danish address and see the public-record information the listing page shows, **without an asking price** (`udbudspris`).

## How it works

1. **Autocomplete runs in the browser** against Klimadatastyrelsen's Adressevælger (`src/lib/address-search.ts`). The API is open (`access-control-allow-origin: *`), so no serverless function is spent on it (`api/` is at the Hobby plan's 12-function cap).
2. Only a complete house number (`type: "husnummer"`, with a DAR UUID) can be chosen. A street-level hit just fills the field so the user keeps typing.
3. The report page (`/address/:husnummerId`) calls `GET /api/property-lookup?husnummerId=<uuid>`: no `askingPrice`, no free-text address. The server resolves the id with `enrichment-sources/adressevaelger.ts` (identity, postal code, municipality, EPSG:25832 -> WGS84 via `geo/etrs89-utm32.ts`), then runs the same BBR / VUR / noise / sales pipeline as for a listing.
4. `lib/address-report.ts` shows a group of values only when its register answered **live**, the same provenance rule as the listing page.

Without an asking price the three price-based screening criteria (`priceCeiling`, `monthlyCost`, `encumbranceRatio`) report `~ "No asking price"` and `priceHeadroomDkk` is null. They are not evaluated against a made-up price. The address page does not display screening at all.

## Why not DAWA

DAWA closed on 2026-10-01 and answers `410 Gone` (verified 2026-10-17). Its replacement, Adressevælger, needs no registration, only a `token` of at least 10 characters. KDS recommends the shared value `adressevaelger123`, which is the default. Override with `ADRESSEVAELGER_TOKEN` / `ADRESSEVAELGER_API_BASE` (server only; the browser client uses the published token). When KDS introduces user management, update both.

## Known gaps

- **Public valuation (VUR) is missing for address lookups.** VUR is keyed by BFE number or matrikel/ejerlav, which Adressevælger does not return. The page says so. Fix: resolve the parcel from the husnummer via Datafordeler's Matriklen GraphQL (DAWA's guide says to join on husnummer-id / jordstykke-id). That needs a `DATAFORDELER_API_KEY` to verify the field names and was not done blind.
- **Panels that need a stored listing row are not shown**: cadastral map, school district, noise panels, SPAR and the smart estimate. Their endpoints read `properties` by id. The page says so.
- BBR and VUR could not be exercised live in development (no Datafordeler key). Everything else was verified against the live Adressevælger.
- Free-text lookups for listings (`address=`) still depend on DAWA's replacement path (the Datafordeler DAR fallback). That is unchanged and out of scope here.
- Every report spends one of the account's 30 register lookups per hour, including failed ones, so the page never retries automatically.
