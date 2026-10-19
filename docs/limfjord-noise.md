# Listing noise context from Tredjekort

Signed-in listing pages independently request
`GET /api/properties?id=<listing UUID>&resource=limfjord-noise&lang=da|en`.
The existing properties function authenticates the caller, reads the stored
listing through the caller's database client. This bounded public-source request
does not consume the separate credentialed register lookup quota.
The resource is private/no-store and does not add a Vercel function or require a
database migration. React Query scopes its five-minute cache to account,
listing and language. A failed noise lookup does not block the listing.

The source is `https://tredjekort.vercel.app/api/address-report`, verified against
the repository homepage and live responses on 28 September 2026. No API key or
new environment variable is needed. Use the stored DAR access-address UUID
first; otherwise send the stored address/postcode. Ambiguous matches are never
silently selected. Returned UUIDs must match and available listing coordinates
must lie within 250 m of the resolved address point; uncertain matches are
unavailable. The server makes one request with a ten-second timeout and returns
only validated fields, not the source's large geometry/project payload.

The UI shows the three **historical 2021 model / 2040 forecast** contour scenarios
separately. It preserves boundaries, conflicting bands, invalid source geometry
and missing contours as uncertain. No contour is not evidence of quietness.
The model includes selected surrounding roads, not only the new motorway.
There is no interpolation, band subtraction, audibility estimate or compliance
claim. Source band labels (including the open-ended 78 dB category) are preserved.

The **current 2035** PDFs are separately linked. Tredjekort does not provide
address-level contours for those PDFs. The live API can also return historical
dwelling receiver records; this integration displays the conservative contour
results and links the full source report for further detail. Distance to the
official **2025 design network** includes ramps and local roads and is never
interpreted as noise exposure. All UI copy is available in Danish and English.

Live smoke checks on 28 September 2026:

- `Nørholmsvej 180, 9000 Aalborg`: HTTP 200; resolved access-address UUID
  `0a3f509c-915c-32b8-e044-0003ba298018`.
- User-provided UUID `0a3f509c-b58c-32b8-e044-0003ba298018`: HTTP 200;
  `Slåenvej 18, 9000 Aalborg`; no matching contour in any historical scenario;
  590 m to the nearest 2025 design centreline; six 2035 PDF maps. Missing contours
  remain unknown noise exposure. Dataset source review: 26 September 2026.

Tests cover parsing/provenance, unknown and ambiguous bands, wrong years/metrics,
top-category semantics, safe official links, identity mismatch, upstream failure,
authenticated dispatch, bilingual rendering and the existing
12-function deployment budget. Production API/source changes that violate the
supported semantics produce an unavailable state instead of reinterpreted data.
