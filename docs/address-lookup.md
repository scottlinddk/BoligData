# Address lookup (homes that are not for sale)

Signed-in users can open **Slå adresse op** (`/address`), pick any Danish address and see the public-record information the listing page shows, **without an asking price** (`udbudspris`), including the smart estimate and fair price for houses.

## How it works

1. **Autocomplete runs in the browser** against Klimadatastyrelsen's Adressevælger (`src/lib/address-search.ts`). The API is open (`access-control-allow-origin: *`), so no serverless function is spent on it (`api/` is at the Hobby plan's 12-function cap).
2. Only a complete house number (`type: "husnummer"`, with a DAR UUID) can be chosen. A street-level hit just fills the field so the user keeps typing.
3. The report page (`/address/:husnummerId`) calls `GET /api/property-lookup?husnummerId=<uuid>`: no `askingPrice`, no free-text address. The server resolves the id with `enrichment-sources/adressevaelger.ts` (identity, postal code, municipality, EPSG:25832 -> WGS84 via `geo/etrs89-utm32.ts`), then runs the same BBR / VUR / noise / sales pipeline as for a listing.
4. `lib/address-report.ts` shows a group of values only when its register answered **live**, the same provenance rule as the listing page.

Without an asking price the three price-based screening criteria (`priceCeiling`, `monthlyCost`, `encumbranceRatio`) report `~ "No asking price"` and `priceHeadroomDkk` is null. They are not evaluated against a made-up price. The address page does not display screening at all.

## Why not DAWA

DAWA closed on 2026-10-01 and answers `410 Gone` (verified 2026-10-17). Its replacement, Adressevælger, needs no registration, only a `token` of at least 10 characters. KDS recommends the shared value `adressevaelger123`, which is the default. Override with `ADRESSEVAELGER_TOKEN` / `ADRESSEVAELGER_API_BASE` (server only; the browser client uses the published token). When KDS introduces user management, update both.

## Valuation, smart estimate and SPAR (houses)

A lookup by id also finds the house's **public valuation** and prices it, using the same SPAR calculation as listings:

1. `vur-valuations.ts` classifies the husnummer from the BBR use codes of every built building on it (houses are 120-132; anything with 140/150/160 or no house code is "other"). A garage or shed next to a house does not block it, unlike `lookupBbr`, which needs exactly one building.
2. For a house it follows `husnummer -> BBR_Grund.bestemtFastEjendom -> BBR_Ejendomsrelation.bfeNummer -> VUR_BFEKrydsreference -> VUR_Ejendomsvurdering`, a TypeScript port of `scripts/backfill-bfe-valuation.mjs`. Keep the two in step, including the valuation-year rules (new system beats old, old-system rows only before 2020).
3. `property-lookup/address-spar.ts` picks the newest valuation year and calls `estimateFromValuation` (the same function `estimateForListing` now uses) against the house market level from `loadSegment`. The result is returned as `spar` on the lookup response.
4. The address page renders the existing `SmartEstimateView` and `SparContent`. With no asking price they show no price comparison.

**Apartments are not priced.** VUR keys an apartment by its own ejerlejlighed BFE; the parcel BFE this chain finds would return the whole building's valuation. They get a "houses only" message. Summer houses and other uses get the same.

### Verification status

Every entity, field and type in the chain was checked against Datafordeler's published schemas (`https://datafordeler.dk/GraphQLSchema/{BBR,VUR}.graphql`) on 2026-10-17, including `Long` types and that only BBR takes `registreringstid`/`virkningstid`. The unit tests pin the exact documents sent.

**Not verified against live data** (no `DATAFORDELER_API_KEY` in development): that `BBR_Grund.bestemtFastEjendom` holds a `BBR_Ejendomsrelation.id_lokalId`. The backfill script's author marked the same link as inferred. Every hop fails soft with a named reason, so if it is wrong the Registerkilder panel shows `valuation: ...`/`bfe: ...` for Vurdering and no number is invented. After deploying, open any house's `/address/<id>` and read that row first.

## Sales history and latest sale

The report opens with the address's own registered sales: the **latest sale** (price, full date and year), then a table of every sale (year, date, price, price per m², type). A family transfer or auction is labelled, and when it is the newest sale the newest arm's-length sale is shown beside it, since such a price is easy to read as a market price. `lib/sales-history.ts` does the sorting and formatting.

The history comes from Boligsiden's address search (`boligsiden-sales.ts`), which only attributes a history to an address that is *identified*, never by coordinates alone. Listings have a Boligsiden address id; an address picked by id does not, so it is identified by **text**: exactly one record in a 40 m box must carry the register's own street, house number and postcode (`recordIsAddress`). Several matching records (units in one building) are refused as `ambiguous`; none is `not_found`. The page says which, so an empty list is never a blank: never sold, address not found at Boligsiden, several homes at the address, or the register being down (which is never shown as "never sold").

**Not verified against the live API.** Boligsiden sits behind a Cloudflare bot challenge that blocks the development environment (`cf-mitigated: challenge`), so the text match was tested against the record shape pinned in `boligsiden-sales.test.ts` (captured 2026-08-01), not against real records. Two things to check after deploy on a house with known sales: that `road.name`/`houseNumber`/`zipCode` spell the address as the register does, and that the house falls inside the 40 m box (Boligsiden's own coordinates for a set-back rural house may differ from the register's access point). A miss shows `not_found`, never another home's sales.

Free-text listing lookups are unchanged: they get no history from this source, as before.

## Known gaps

- **Cadastral map, school district, noise panels and the price-by-time-on-market card** need a stored listing row and are not shown.
- **Free-text lookups for listings** (`address=`) still use the introspection-based valuation source, which Datafordeler's switched-off introspection likely breaks. Out of scope here; listings get their valuation from the stored backfill.
- Every report spends one of the account's 30 register lookups per hour, including failed ones, so the page never retries automatically. Loading the market level is cached for 30 minutes per instance.
