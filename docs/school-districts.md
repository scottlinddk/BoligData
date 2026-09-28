# Listing school districts

Each signed-in listing page loads a separate school-district panel through
`GET /api/properties?id=<property-id>&resource=school-district`. The handler
uses the authenticated user's database client and reads only the stored
listing's address, postcode, DAR Husnummer ID and data mode. No database
migration, crawler backfill, new Vercel function or source credential is needed.

The source is Skoledistrikt.dk's public API, also used by its own website:

- `https://skoledistrikt.dk/api/address/autocomplete?q=<address>`
- `https://skoledistrikt.dk/api/school-district/by-address?id=<husnummer-uuid>`

The existing `idLokalid` is a DAR **Husnummer** UUID, compatible with the source's
address picker (`kind: "husnummer"`). When it is absent, only a unique exact
street, house number and postcode match is accepted from autocomplete. A unit
suffix after a comma does not change its building entrance. Both paths require
the district response to corroborate that entrance and postcode before any
school is displayed. Unsupported address formatting remains explicitly
unavailable; no first fuzzy result, coordinate proximity or nearest-school
estimate substitutes for district membership.

The panel shows every returned school, grades including grade zero, the source's
confidence and cache/origin label, retrieval date, direct source data and school
profile links. Empty coverage, an unresolved address and upstream failure have
separate messages. The provider's disclaimer and municipal-confirmation advice
remain visible. The result is advisory and does not guarantee admission.

Lookup requests time out after five seconds per upstream call, with no retries
(one call for an existing ID, at most two for address resolution). Failures stay
inside this separate query, leaving the listing and other register data usable.
The browser query is cached for 30 minutes and scoped to the authenticated user;
the HTTP response is `private, no-store`. Mock/demo listings are not sent to the
public source. No returned school information is written to the database.

## Live verification, 2026-09-28

The implementation was run against the live source with both a stored ID and
the autocomplete fallback:

- Address: Slåenvej 18, 9000 Aalborg
- Husnummer ID: `0a3f509c-b58c-32b8-e044-0003ba298018`
- School: Gl. Hasseris Skole, grades 0–9
- Source confidence: `high`; source status: `CACHE`
- Profile: <https://skoledistrikt.dk/skole/aalborg/gl-hasseris-skole>

At verification time `/skoledistrikt` returned the provider's not-found page;
the panel therefore links to its working address-search homepage at
<https://skoledistrikt.dk/>. The API is public but not a versioned service
contract, so mapping is defensive and schema changes become unavailable data.

Regression tests cover exact/ambiguous/wrong identity, all school matches and
grade ranges, missing coverage, malformed responses and network failures,
authenticated endpoint isolation, and Danish/English rendering. Full web suite:
1,013 passing tests. Frontend/API/shared type checks and production build pass.
