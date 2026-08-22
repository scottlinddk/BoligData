# Reconciling the ChatGPT "adresse → due-diligence rapport" plan (2026-08-22)

A ChatGPT-authored plan proposed BoligData as a general-purpose, address-based property
research/due-diligence engine for the Danish market (Aalborg first): type in an address, resolve it
through DAR → BFE-nummer → BBR/matrikel, pull every relevant public register, parse the uploaded
salgsopstilling into structured claims, cross-check it against the registers, surface discrepancies,
and generate an LLM due-diligence report with a fair-value estimate.

This document holds that plan against the actual repo and records what was adopted, what was
deliberately deferred, and why.

## The repo is not that product — and isn't pivoting to be

BoligData is a mature, actively-developed product (~72 merged PRs as of this writing, live Supabase +
Vercel deployment, real Boligsiden crawl data flowing daily) built around a different idea: a **daily
crawl of Boligsiden/Boliga listings**, screened against **six hard buying criteria** (price ceiling,
monthly cost, area, rooms, takeover date, encumbrance ratio) and scored **relatively** across
candidates, for Scott's own house hunt. It is not a "type any address, get a full report" tool, and
per Scott's decision this reconciliation does **not** pivot the product toward that broader shape.
What follows adopts the concrete, useful pieces of the ChatGPT plan into the existing architecture,
and explicitly defers or drops the parts that belong to the broader product the repo isn't building.

## Adopted this round

| Idea (from the ChatGPT plan) | What was actually done |
|---|---|
| DAWA is being retired; don't build new core integrations on it | The repo's own README already flagged "DAWA closes 2026-08-17" — already past as of today (2026-08-22) — with **zero fallback** on the one source (`address-lookup.ts`) that resolves every address into the DAR husnummer UUID and doubles as the geocoder for BBR/VUR/noise/sales. Added a structured Datafordeler DAR GraphQL fallback so a DAWA outage degrades address resolution rather than taking down the whole pipeline. See "DAWA resilience" below. |
| BFE-nummer should be a first-class identity | `bfeNummer` was already resolved live per request (`address-lookup.ts`) but never stored. Added `properties.bfe_nummer` (migration `021`) so it's a persisted, queryable column — a partial adoption, not the plan's full normalized `Property`/`Parcel`/`Building` schema (see "Explicitly not adopted"). |

### DAWA resilience

`lookupAddressCadastral` now falls back to a Datafordeler DAR GraphQL lookup
(`address-lookup-dar-fallback.ts`) when DAWA's `adgangsadresser` search fails outright (network error,
non-2xx, or DAWA disappearing post-sunset) and `DATAFORDELER_API_KEY` is configured. DAR has no
fuzzy free-text search like DAWA's `q=`, so the fallback parses the free-text address into street
name + house number (+ optional postal code) and queries DAR's `Husnummer` entity by those structured
fields, reusing the same GraphQL client, version-walking, and schema-introspection helpers
(`datafordeler.ts`) that `bbr.ts` already relies on for its DAR→BBR traversal.

**Known limitation, by design, not an oversight:** the fallback resolves identity and geocoding
(`idLokalid`, `lat`/`lon`, `postalCode`, `municipalityCode`, `formattedAddress`) — enough to unblock
BBR, VUR and the noise/sales lookups, all of which key off the husnummer UUID or coordinates — but
**not** `matrikelnr`/`ejerlav`/`bfeNummer`/`zone`. Resolving those from DAR alone requires a spatial
join against Matriklen's parcel geometry (or a Grunddata linking table), which is a materially bigger,
separately-scoped piece of work, and one this sandbox cannot verify against a live schema anyway.
Falling back honestly to "identity resolved, cadastral fields null" is consistent with how every other
source in this repo already behaves (`sourceFailed` over fabricated data) — the alternative,
guessing at a spatial join with no way to verify it, would be worse than a null. Every response
distinguishes which path resolved a given address (`resolvedVia: "dawa" | "dar_fallback"`), surfaced
through `/api/property-lookup`'s existing `sources[]` provenance array.

**Not verified live**: this sandbox has no network egress to `dataforsyningen.dk` or
`datafordeler.dk` (same limitation noted throughout the repo's git history), so neither "is DAWA
actually down right now" nor the DAR fallback's exact field names could be confirmed directly. The
fallback follows the same defensive pattern `bbr.ts` uses for exactly this reason: field names are
guessed from Datafordeler's published DAR data model, checked against the live schema via
introspection when available, and a wrong guess costs facts (an unavailable source) rather than
fabricating a result. **Manual follow-up**: confirm DAWA's actual live status, and verify the DAR
fallback's field names against a live schema fetch, before relying on it in production.

## Explicitly deferred (documented roadmap, not built this round)

These are real, well-argued ideas from the ChatGPT plan. They're not rejected — they just don't fit
the "keep the current direction, borrow select ideas" scope Scott chose for this pass, and some need
their own research spike before a build decision.

| Idea | Status | Notes |
|---|---|---|
| Plandata.dk lokalplan/zonekort integration | Not started | Directly useful: DAWA's `zone` field already answers the retired `"Udfaset"` for every address, so `properties.zone` has had no real source since that field was deprecated. Plandata's zonekort WFS is the natural replacement, and lokalplan lookup (including a radius search for nearby *pending* plans, per the ChatGPT plan) would be a genuinely new due-diligence signal. Good candidate for the next enrichment source. |
| Aalborg Kommune byggesagsarkiv + OCR/LLM extraction | Not started | No public API confirmed to exist for Aalborg's byggesagsarkiv — needs its own research spike (screen-scraping vs. a data-sharing request to the kommune) before a build-vs-defer decision, same caution the repo already applies to Boligsiden/Boliga's unofficial APIs. |
| Real energimærke (EMO/Energistyrelsen) register integration | Not started | Independent of this plan, but worth flagging: `bbrData.energyLabel` today is **caller-supplied input**, not a BBR value — it's echoed from the request into a field that implies register provenance. A real energy-label lookup would fix both the missing source and this existing correctness gap (see `docs/property-lookup-plan.md` §8, finding 3). |
| Evidence/provenance model with field-level quote + confidence | Not started | The repo already has a coarser version — every value is tagged `source: "ai"` vs. `"verified"`, and `sources[]` reports per-register `live`/`mock`/`unavailable`. The ChatGPT plan's per-*value* provenance (source, page, quote, timestamp, confidence) is a real refinement but a bigger structural change; revisit once a document-ingestion pipeline exists. |
| Salgsopstilling PDF upload/parsing | Not pursued | Core to the ChatGPT plan's product idea (verify listing claims against registers) but this repo's `renovation-category.ts` already documents PDF parsing as an explicit non-goal of the current screening product. Would only make sense as part of a pivot to the broader research-engine product, which Scott chose not to do. |
| General cross-source discrepancy engine | Not pursued | Same reasoning — without salgsopstilling parsing there's no second claim to reconcile against the registers; this only becomes valuable alongside document ingestion. |
| LLM-generated due-diligence report | Not pursued | Belongs to the broader research-engine product, not the screening/scoring tool this repo builds today. |
| Tinglysning, GeoDanmark/SDFI, klima/oversvømmelse | Unchanged | Tinglysning is already handled the way the ChatGPT plan itself recommends for a first version (a deep link, not an automated true/false — see `tinglysning-link.ts`). GeoDanmark/SDFI and flood/climate data remain future candidates, same priority as in the plan's own "P2" tier. |

## Why BFE isn't the full central identity yet

The ChatGPT plan's core architectural principle — address is input, BFE is identity, everything else
hangs off BFE via a normalized `Property`/`Parcel`/`Building`/`Sale`/`Listing` schema — is sound, but
`properties` in this repo is a single wide table keyed by `(listing_source, external_id)`, built for
"one row per crawled listing," not "one row per real-world property with N listings/sales over time."
Restructuring that is a genuine schema migration with real product implications (deduplicating
listings across sources by BFE, historical sales as their own table, etc.) — valuable, but out of
scope for "borrow select ideas without pivoting the product." This round stores `bfe_nummer` as a
queryable column so that future work (dedup, comparable-sales joins, a proper `Parcel` table) has
something to build on, without committing to the larger migration now.
