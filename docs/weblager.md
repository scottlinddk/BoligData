# WebLager building case link

WebLager (weblager.dk) is a front end for scanned municipal building case files (byggesagsarkiv). It is not a data source. No public API was found, and the documents are scanned PDFs and drawings, so there is nothing structured to ingest.

BoligData only shows an **advisory link** to the municipality's WebLager search page in the due-diligence checklist ("Byggesager" / "Building cases"). The user types the address in WebLager's own search box. Some cases are closed to the public, so an empty result does not mean there are no building cases.

## URL anatomy

Verified example (Skodsborgvej 15, 9270 Klarup, Aalborg Kommune):

`https://weblager.dk/public/municipality/851/45/search/all?addressId=2919076`

| Part | Value | Derivable from our data? |
|---|---|---|
| `municipality/851` | Municipality code (Aalborg) | Yes, via the municipality name we store |
| `/45/` | Unknown. Archive or tenant id, possibly constant | No, needs research (#113) |
| `addressId=2919076` | WebLager internal id. Not a DAR/DAWA UUID | No, needs research (#118) |

The link we build stops before the query string: `https://weblager.dk/public/municipality/851/45/search/all`. We never append `addressId`, because it cannot be derived from `idLokalid` and a wrong property is worse than no link.

## Verified municipalities

| Code | Municipality | Segment | URL | Verified |
|---|---|---|---|---|
| 851 | Aalborg | 45 | `https://weblager.dk/public/municipality/851/45/search/all` | By the project owner, from the example URL above |

The map lives in `apps/web/server/lib/enrichment-sources/weblager-link.ts`, keyed by municipality **name**. Lookup is an exact match. Any other name, casing or diacritics returns `null` and the checklist shows neutral text and no link.

## What was and was not verified

- Verified: the example URL above, supplied by the project owner.
- Not verified: that the link opens correctly. weblager.dk was unreachable from the development sandbox (egress proxy returned 403), so live behaviour must be checked in a browser.
- Not verified: whether the segment `45` is constant or per municipality. No other municipality is seeded.
- Not verified: WebLager's terms of use and robots.txt, and whether a sanctioned API exists. We make no requests to weblager.dk.

## Open questions

- #113: is `45` constant, per municipality or per archive? Map 5 or more municipalities from a browser.
- #114: terms, robots.txt, and ask WebLager about an API and whether `addressId` is stable.
- #118: how does WebLager resolve an address to `addressId`? This gates all of Phase 2 (#119, #120).

## Rollout note

`risk_flags` is a JSON column, so no migration is needed. Existing rows lack `buildingCaseArchiveUrl` and render the neutral state until the next crawl re-enriches them.
