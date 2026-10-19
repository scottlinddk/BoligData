# Cadastral land-property details

The listing page has a Danish/English **Matrikel, grundareal og ejere** panel.
Opening it requests `GET /api/properties?id=<listing UUID>&resource=cadastral`.
It uses the existing authenticated handler and RLS client, returns `private,
no-store`, and consumes the existing atomic `consume_register_lookup_budget`
quota (migration 023). It does not introduce a function, migration, database
column, crawl backfill, or production write. The panel caches per user/listing
for ten minutes and does not query the register until opened.

## Sources and identity

Production uses the deployment's existing `DATAFORDELER_API_KEY`. The source
calls `MAT/v2` for a current `MAT_SamletFastEjendom` and `Flexible/v2` for current
parcels plus cadastral-district/geometry joins. Each query supplies both
registration and effective timestamps, matching Matriklen's public client.
There is no copied public-site credential in the code.

A stored BFE identifies the land property. Without one, the source uses the
stored DAR husnummer UUID, or a strict unique DAWA street/house/postcode match,
and traverses husnummer → jordstykke → samlet fast ejendom. Ambiguous joins and
wrong-house address responses remain unavailable. Mock/demo listings never
query real registers or link fabricated identifiers to real properties.

The API reports `scope: land_property`. A parent BFE and its ground area do not
identify the individual condominium. Individual unit ownership is not inferred.
If the source flags a condominium parent or common lot, the UI directs the user
to the relevant official lookup rather than attributing a parent owner to a unit.
If a stored BFE is a unit rather than a land estate, this land-property query
returns unavailable/not found and retains the generic official BFE link.

## Area and map

**Samlet areal** sums all directly attached current parcels' `registreretAreal`,
as Matriklen does. It excludes shared-lot interests. Pagination is bounded at
201 parcels / 100 geometry parts per parcel. A truncated, duplicate, empty, or
unknown-area result cannot become a misleading total. Road, protected forest,
coastal protection and dune protection areas are shown when supplied; omitted
fields remain unknown.

Matriklen's response CSP permits framing only on its own domains. BoligData
therefore draws a north-up boundary plan from official EPSG:25832 Polygon or
MultiPolygon geometry, preserving holes, and links to the complete official
map. The plan has no basemap and does not claim surveyed boundary accuracy.
Only a complete parcel geometry set or the full estate geometry is displayed.
Unknown coordinate systems and malformed geometry are not drawn.

## Ownership and upstream failures

The public Matriklen client uses `api/v3.3/BfeEjer?bfe=<BFE>` without a bearer
token. The adapter copies only owner name/type, CVR, shares and dates. It does
not return CPR identifiers, home/contact addresses, or protected names.
`BeskyttetPerson` is always redacted, and `Opdelt i ejerlejligheder` is treated
as a subdivision marker, not an owner. Authentication-required and unavailable
responses remain distinct. Owner failures cannot remove geometry/area results.

Every upstream call is bounded to six seconds with no automatic retries. The
existing properties function allows 60 seconds for the sequential identity
and register lookups. The shared register quota fails closed. Error responses
do not expose raw source diagnostics or credentials.

## Verification — 28 September 2026

Live public-map queries verified the exact MAT/Flexible requests and the
supplied DAR UUID `0a3f509c-b58c-32b8-e044-0003ba298018` → BFE `3299386` join.
The example is parcel `12ab`, Gl. Hasseris By, Hasseris (610452), registered
area **800 m²**, road area **0 m²**, with actual EPSG:25832 boundary geometry.
The strict DAWA address search returned the matching access address.

The older REST `Ejendom/Ejendom` route returned 401, so it is not used. The
public ownership endpoint timed out / returned 504 during verification; owner
field mapping is verified against Matriklen's current client and covered by
fixtures, but successful live ownership retrieval remains unverified. No
private owner names are committed as fixtures. Availability should be checked
again on the preview using the deployment's own register key.

Tests cover schema shape, exact joins, ambiguous/no-match addresses, complete
multi-parcel totals, missing fields, geometry holes/CRS/partial failures, owner
redaction/subdivision handling, authentication, quota failures and DA/EN UI.
