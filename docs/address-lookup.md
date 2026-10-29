# Address lookup (homes that are not for sale)

Signed-in users can open **Slå adresse op** (`/address`), pick any Danish address and see the public-record information the listing page shows, **without an asking price** (`udbudspris`), including the smart estimate and fair price for houses.

## How it works

1. **Autocomplete runs in the browser** against Klimadatastyrelsen's Adressevælger (`src/lib/address-search.ts`). The API is open (`access-control-allow-origin: *`), so no serverless function is spent on it (`api/` is at the Hobby plan's 12-function cap).
2. Only a complete house number (`type: "husnummer"`, with a DAR UUID) can be chosen. A street-level hit just fills the field so the user keeps typing.
3. The report page (`/address/:husnummerId`) calls `GET /api/property-lookup?husnummerId=<uuid>`: no `askingPrice`, no free-text address. The server resolves the id with `enrichment-sources/adressevaelger.ts` (identity, postal code, municipality, EPSG:25832 -> WGS84 via `geo/etrs89-utm32.ts`), then runs the same BBR / VUR / noise / sales pipeline as for a listing.
4. `lib/address-report.ts` shows a group of values only when its register answered **live**, the same provenance rule as the listing page.

Without an asking price the three price-based screening criteria (`priceCeiling`, `monthlyCost`, `encumbranceRatio`) report `~ "No asking price"` and `priceHeadroomDkk` is null. They are not evaluated against a made-up price. The address page does not display screening at all.

## Why not DAWA

DAWA closed on 2026-10-01 and answers `410 Gone` (verified 2026-10-17). Two services replace it:

- **Free-text addresses (listings, crawl)** resolve through Datafordeler's DAR GraphQL service (`enrichment-sources/address-lookup-dar.ts`, needs `DATAFORDELER_API_KEY`): `DAR_Husnummer` for identity, `DAR_Adressepunkt` for coordinates, and the Flexible service (`husnummerErPlaceretPaaJordstykke` -> `jordstykkeSamlesISamletFastEjendom`) for `matrikelnr`, ejerlav and BFE number. A husnummer on several parcels leaves matrikelnr/ejerlav empty, and one on several estates leaves the BFE empty. The parcel step never fails the lookup.
- **Adressevælger** needs no registration, only a `token` of at least 10 characters. KDS recommends the shared value `adressevaelger123`, which is the default. Override with `ADRESSEVAELGER_TOKEN` / `ADRESSEVAELGER_API_BASE` (server only; the browser client uses the published token). When KDS introduces user management, update both. It serves the autocomplete, id lookups, and is the keyless fallback for free text (identity and coordinates, no parcel).

**Not verified against live data:** the Flexible parcel query reuses the field names and join `cadastral/source.ts` already sends (`matrikelnummer`, `jordstykkeLiggerIEjerlav { ejerlavskode ejerlavsnavn }`, `BFEnummer`), but the unit tests pin the document and a stubbed answer, not a real response. After deploying, check that a crawl's `matrikelLookupFailed` count drops sharply.

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

When a sales source is connected, the report opens with the address's own registered sales: the **latest sale** (price, full date and year), then a table of every sale (year, date, price, price per m², type). A family transfer or auction is labelled, and when it is the newest sale the newest arm's-length sale is shown beside it, since such a price is easy to read as a market price. `lib/sales-history.ts` does the sorting and formatting.

No sale history is shown today. It used to come from Boligsiden's address search, which has been removed because Boligsiden prohibits automated collection. Registered sales (tinglysning) need a licensed source, for example the Ejerfortegnelsen/EJF or a data agreement; until one is connected the lookup returns an empty history and the page says it is unavailable. `lib/sales-history.ts` still does the sorting and formatting for when a source returns.

## Due-diligence checklist

Addresses and listings share one flag builder (`server/lib/due-diligence/risk-flags.ts`) and one checklist component. See [due-diligence checklist sources](due-diligence-checklist.md) for every item's source, what was verified live and what each answer means. For an address the oil tank has **no age heuristic**: when BBR does not settle the heating it stays unknown.

`municipalities.ts` maps the register's municipality code to the name the link builders are keyed by. Its 11 codes were checked against the address register on 2026-10-17 by reading the code it reports for real addresses in each. Other municipalities get no links rather than guessed ones.

An item with no answer now names where an answer would come from, instead of repeating "no data" as its own source, and the wording no longer uses the internal term "enrichment" (da: "berigelsesdata").

## Known gaps

- **Cadastral map, school district, noise panels and the price-by-time-on-market card** need a stored listing row and are not shown. Without a parcel there is no attest link of our own; a V1/V2 hit links the contamination register's attest for that site.
- **Free-text lookups for listings** (`address=`) still use the introspection-based valuation source, which Datafordeler's switched-off introspection likely breaks. Out of scope here; listings get their valuation from the stored backfill.
- Every report spends one of the account's 30 register lookups per hour, including failed ones, so the page never retries automatically. Loading the market level is cached for 30 minutes per instance.
