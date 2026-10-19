# Listing school districts

Each signed-in listing page loads a separate school-district panel through
`GET /api/properties?id=<property-id>&resource=school-district`. The handler
uses the authenticated user's database client and reads only the stored
listing's address, postcode, DAR Husnummer ID and data mode. No database
migration, crawler backfill, new Vercel function or source credential is needed.

## Sources, in order

1. **LIFA AdresseService** (primary). The municipalities' own district register,
   established by KL with KMD, IST and LIFA, with a daily overlay of addresses on
   school districts. Service A, `AdresseDistrikter/Skole`:
   - `https://adresseservice.lifa.dk/api/AdresseDistrikter/Skole?id=<adresse-uuid>`
   - `https://adresseservice.lifa.dk/api/AdresseDistrikter/Skole?vejnavn=<street>&husnr=<no>`
     when no DAR ID is stored.
2. **Skoledistrikt.dk** (fallback). A third-party site that republishes GeoFA
   and LIFA data, also used by its own website:
   - `https://skoledistrikt.dk/api/address/autocomplete?q=<address>`
   - `https://skoledistrikt.dk/api/school-district/by-address?id=<husnummer-uuid>`

LIFA's result is used only when the response names exactly one address whose
street, house number and postcode match the listing (and whose `adr_id`, when
present, equals the stored DAR ID), and that address has at least one district.
Anything else, including HTTP errors, unknown payloads, ambiguity or zero
districts, falls through to Skoledistrikt.dk with its unchanged behaviour. So
LIFA can only add verified answers and never removes one Skoledistrikt.dk gave.
`provider` on the result (`lifa` | `skoledistrikt` | `null`) drives the panel's
attribution.

### LIFA response contract: not yet live-verified

The field names (`adr_id`, `vejnavn`, `adresseringsvejnavn`, `husnr`, `postnr`,
`postnrnavn`, `distriktsnavn`, `distriktsnr`, `starttrinkode`/`starttrin`,
`sluttrinkode`/`sluttrin`) come from LIFA's "Skoledistrikter, dokumentation,
adresseservice" notat v5.0. That notat does not pin down how districts nest
under the address, and the service could not be reached from the development
environment. The parser therefore finds records by their documented fields
rather than envelope keys (nested list, sibling objects and flat joined rows are
all tested), reads grades from either the code or the label (`"7. klasse"`,
`"Børnehaveklasse"`), and caps depth and node count. Two assumptions still
need a live check:

- `id` accepts the DAR **Husnummer** (adgangsadresse) UUID we store. If LIFA
  expects a unit-address UUID, the ID path returns nothing and the fallback
  answers, which is safe but means LIFA is unused for those listings.
- JSON is returned for `Accept: application/json` (ASP.NET Web API content
  negotiation). If it returns XML, parsing fails and the fallback answers.

LIFA does not publish a confidence level or a municipality name, so the panel
omits "Source confidence" for LIFA results and shows no municipality.

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

Lookup requests have no retries. LIFA times out after four seconds (one call);
Skoledistrikt.dk after five seconds per call (one call for an existing ID, at
most two for address resolution). Worst case is about 14 seconds, well within
the endpoint's 60-second budget. Failures stay
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
1,008 passing tests. Frontend/API/shared type checks and production build pass.
