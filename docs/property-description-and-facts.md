# Property descriptions and facts

The Boligsiden crawler previously stored only `descriptionTitle`. It now
stores `descriptionBody` when supplied, and maps the live `yearBuilt` field.
The detail endpoint also retrieves source details for existing Boligsiden
rows, so a deployment does not require a database migration or recrawl.
Explicit mock/demo rows are excluded. Legacy rows retain their existing
provenance; the source supplement is independently fetched and identified.

`GET /api/properties?id=…` remains authenticated and `private, no-store`.
Its optional `listingDetails` response contains the broker heading/body and
source-reported building facts. The lookup uses the stored coordinates to
query a 50-metre box, then requires the exact source case UUID. It never
selects an apartment by address text or result order. Requests share a
3-second deadline, are deduplicated and cached for five minutes in the warm
function instance. Missing/failed results have a 30-second cache. The stored
property remains available when Boligsiden is unavailable.

The UI labels the text “Mægler skriver” and links to the full original
listing. Boligsiden sometimes supplies an excerpt; the app preserves the
available text without inventing a continuation. Listing facts appear in
their own source-labelled panel. Official BBR/VUR observations retain their
existing provenance rules. Unavailable fields are omitted; register lookup
loading/unavailability is shown explicitly. Known cadastral values remain
visible even without BBR values.

Building selection requires a unique residential area match. A garage or
shed cannot supply the home's materials. Building storeys come from the
selected building, and a whole apartment building's basement area is never
presented as the apartment's basement. Public valuation from the listing is
labelled as source-reported and has no invented valuation year or land value.

Property browser titles use the address and translated application name,
for example `Skytten 1A | BoligData`, and reset when leaving the detail route.

## Verification on 28 September 2026

The [Skytten 1A, 3. th. source listing](https://www.boligsiden.dk/adresse/skytten-1a-3-th-9000-aalborg)
has case UUID `8429dc34-2a49-41f8-8589-79092bb6e2e3`.
The live [Boligsiden case search](https://api.boligsiden.dk/search/cases)
returned two units in the small geographic box. The runtime helper selected
the exact case and returned its heading, 499-character trimmed body, 43 m²,
1937 construction year, three building storeys, energy C, brick walls,
fibre-cement roof, district heating, one toilet and one bathroom. The source's
210 m² building basement was correctly omitted. The lookup took approximately
300 ms during verification.

Automated coverage includes exact-case identity, malformed/ambiguous data,
timeouts and failures, cache expiry, stored descriptions, authentication,
register provenance, safe text rendering and nonempty fact rows. The local
browser preview used the captured public source payload and confirmed the
description/facts layout and titles across listing changes, language changes
and navigation away. Production requires a signed-in session and has not
been changed by this implementation.
