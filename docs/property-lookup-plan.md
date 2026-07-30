# Plan: Property Lookup Endpoint (BBR / OIS / DAR / Datafordeler)

> **Status update, 30 July 2026 (audited against the repo):** The
> property-lookup endpoint, its screening engine, and its scoring-inputs
> extraction are **fully implemented and tested**, not just the adapters
> and schema as an earlier status note assumed. This document is a
> refined reference architecture + validation/audit checklist, corrected
> against the actual code and `README.md` rather than re-derived from
> scratch. Anything below marked "done" matches the live implementation;
> anything marked "open" is a genuine gap or pending decision.

---

## 0. Current status (confirmed 30 July 2026)

- Repo, Supabase schema, Datafordeler-backed adapters (DAR, BBR,
  Matriklen, VUR), the `/api/property-lookup` endpoint, the screening
  engine, and the scoring-inputs extraction: **all implemented and
  tested**.
- Datafordeler account: **confirmed to exist**, `DATAFORDELER_API_KEY`
  already set in Vercel production. The real remaining blocker is that
  the BBR/Matriklen/VUR **GraphQL schema field names are unverified**
  against the live Datafordeler docs (sandboxed dev environments can't
  reach `datafordeler.dk`), so `BBR_MOCK_MODE` / `MATRIKEL_MOCK_MODE` /
  `EJENDOMSVURDERING_MOCK_MODE` all still default to mock in production.
  All 127 currently-ingested rows have `enrichments.source = "mock"`.
- **Confirmed NOT done:** the daily ingest cron (`crawl.yml`) only calls
  `/api/crawl`; nothing calls `/api/property-lookup` on a schedule, and
  no frontend page consumes it yet either. Phase 4 (below) is open, not
  tentative.
- GrunddataAPI build-vs-buy: still **not decided** — the thin
  adapter-interface pattern already used (`enrichment-sources/*.ts`, one
  file per source, common `MOCK_MODE` gating) makes this a low-cost
  decision to defer or reverse later, exactly as originally planned.

---

## 1. Goal

A single endpoint that takes a Danish address as input and returns:

1. Normalized raw property data (BBR, public valuation, DAR-resolved
   identifiers).
2. A set of **screening symbols** (✅ / ⚠️ / ❌ / ~) evaluated against the
   **six** hard criteria in the house-buying decision rule (price ceiling
   by renovation category, monthly cost, m², rooms, takeover date,
   encumbrance ratio).
3. The **input values** needed for the relative scoring model (weighted
   comparison across multiple candidate properties), not the score itself
   — scoring stays a pure function on the frontend/API layer so weights
   can be tuned without re-fetching data.

Every symbol returned by this endpoint carries a `source: "ai"` tag.
Confirmed: no code path in the current implementation ever sets
`source: "verified"` — that distinction stays a human decision.

```
GET /api/property-lookup?address=<free-text address>&askingPrice=<dkk>
```

**Live today.** Implemented in `apps/web/api/property-lookup.ts` →
`apps/web/server/lib/property-lookup/property-lookup.handler.ts`, with
test coverage in `property-lookup.handler.test.ts`. Requires the same
`Authorization: Bearer <jwt>` session as `/api/properties/:id`. Optional
query params: `postalCode`, `lat`, `lon`, `sellerTakeoverDate`,
`totalEncumbrancesDkk`, `roomCount`, `roomCountDefinition` (`A`/`B`/`C`,
defaults to `B`), `energyLabel`.

---

## 2. Data sources and access model

| Source | Provides | Access | Status |
|---|---|---|---|
| **DAR** (via Datafordeler) | Resolves free-text address → id_lokalid, matrikelnr, ejerlav, zone | Datafordeler REST, no auth needed | Live-capable; `address-lookup.ts`, default mock via `ADDRESS_LOOKUP_MOCK_MODE` |
| **BBR** (via Datafordeler) | Build year, renovation year, floor area, floors, roof/wall material, heating installation | Datafordeler **GraphQL** (`graphql.datafordeler.dk/BBR/<version>`), `DATAFORDELER_API_KEY` | Implemented (`bbr.ts`); entity/field names unverified against live v3 schema — blocks flipping `BBR_MOCK_MODE=false` |
| **OIS / public valuation** | Assessed property value, assessed land value, valuation year | Datafordeler VUR GraphQL, same API key | Implemented as `ejendomsvurdering.ts` — there is no separate "OIS" client; VUR fills this role. `EnrichmentSource` still has an unused `"ois"` literal (dead enum value, cosmetic) |
| **Matriklen (cadastral)** | Registered parcel area | Datafordeler GraphQL, same API key | Implemented (`matrikel.ts`); field name unverified against live schema |
| **Boliga/Boligsiden** | Comparable sales, days on market, price history | Unofficial JSON APIs (not official) | Implemented (`crawl/{boliga,boligsiden}.ts`); **Boliga blocked by Vercel-IP-range 403s** as of 2026-07-10, disabled via `CRAWL_SOURCES=boligsiden`; Boligsiden ingests live data cleanly. Feeds `comparables.ts` (Supabase-based, haversine distance) — a separate code path from property-lookup, not a stub |
| **GrunddataAPI (optional)** | Wraps BBR/DAR/Tinglysning/Vurderingsstyrelsen/Plandata/Miljøportal in one paid REST API | — | Build-vs-buy still **not decided** — see §7 |

---

## 3. Where this fits in the existing architecture

There is no separate `apps/api` app — everything lives inside the single
`apps/web` Vite + Vercel-functions app:

```
apps/
└── web/
    ├── api/                                  # Vercel serverless entry points (thin)
    │   └── property-lookup.ts
    └── server/lib/
        ├── enrichment-sources/
        │   ├── address-lookup.ts             # DAR + zone (REST, no auth)
        │   ├── bbr.ts                        # BBR (GraphQL, DATAFORDELER_API_KEY)
        │   ├── ejendomsvurdering.ts           # VUR / public valuation ("OIS" role)
        │   ├── matrikel.ts                    # cadastral parcel area
        │   └── stoejkort.ts, geus-jordart.ts, miljoeportalen-v1v2.ts, ...
        ├── screening/
        │   ├── hard-criteria.ts              # six pure criterion functions
        │   ├── renovation-category.ts        # A–D estimate, always isEstimate:true unless overridden
        │   ├── symbol-engine.ts              # composes the six checks
        │   └── config/financing-assumptions.ts
        ├── scoring/
        │   └── relative-score-inputs.ts       # 7 raw scoring inputs, no weighting
        ├── property-lookup/
        │   └── property-lookup.handler.ts     # orchestrates DAR -> BBR+VUR -> screening -> scoring
        ├── crawl/                             # boliga/boligsiden ingest + comparables inputs
        └── comparables.ts                     # Supabase-based comparables (separate from property-lookup)

packages/
├── shared/src/types/
│   ├── property-lookup.ts                    # PropertyLookupInput/Result, ScreeningCriterionResult, ScoringInputs, ScreeningSymbol
│   └── index.ts                              # Property, BbrData, Enrichment, PublicValuation, EnrichmentSource
└── supabase/migrations/                      # 19 migrations, all applied
```

`packages/shared/src/types` already exports `ScreeningCriterionResult`
and `ScoringInputs`-equivalent types, consumed by the handler. There is
no type literally named `PropertyRaw`/`ScreeningResult` — the closest
matches are `Property` and `ScreeningCriterionResult[]`; not worth
renaming.

---

## 4. Screening rule engine (`screening/hard-criteria.ts`)

Implemented as six pure, independently-testable functions (confirmed via
`symbol-engine.ts` — there is no seventh check anywhere in the codebase;
an earlier version of this doc said "seven," that was wrong):

- `checkPriceCeiling(askingPrice, renovationCategory, isEstimate, assumptions)`
- `checkMonthlyCost(askingPrice, energyLabel, assumptions)` — mortgage via
  Model B (realkredit-only) + grundskyld estimate + energy-label utility
  table
- `checkArea(areaSqm, assumptions)`
- `checkRooms(roomCount, roomCountDefinition, assumptions)` — definition
  defaults to `"B"`, passed as a parameter, not hardcoded
- `checkTakeoverDate(sellerTakeoverDate, assumptions)`
- `checkEncumbranceRatio(totalEncumbrancesDkk, askingPrice, assumptions)`
  — always `~`/unavailable in practice since tinglysning.dk has no open
  API

Each returns `{ passed, symbol, reason, source: "ai" }` — matches spec
exactly, tested in `hard-criteria.test.ts`.

Financing constants live in `screening/config/financing-assumptions.ts`
as `DEFAULT_FINANCING_ASSUMPTIONS`, every value overridable via
`SCREENING_*` env vars — matches the spec's design intent. **All current
default values are placeholders**, marked `TODO(scott)` inline, pending
confirmation of the real house-buying decision rule thresholds (see
README "Manual follow-up steps" item 10).

---

## 5. Phased build plan — status

**Phase 0 — spikes: done.**
- Datafordeler account confirmed, key in Vercel.
- OIS resolved to be VUR (`ejendomsvurdering.ts`), same Datafordeler
  account/API key as BBR/Matriklen — no separate integration needed.
- Comparables are not a mock stub — real Boliga/Boligsiden clients exist
  (Boliga currently blocked by IP-range 403s, Boligsiden live).

**Phase 1 — address resolution + raw BBR: done.**
- `address-lookup.ts` (DAR + zone), `bbr.ts` (BBR via GraphQL).

**Phase 2 — screening engine: done.**
- `hard-criteria.ts` + `symbol-engine.ts`, six checks, every value
  tagged `source: "ai"`.

**Phase 3 — scoring inputs: done.**
- `relative-score-inputs.ts` extracts location match, condition proxy,
  price headroom, area margin, school-district score, noise-zone
  estimate, legal-risk proxy. `locationMatch` and `schoolDistrictScore`
  are permanently `null` — no source wired in yet, not a bug. Does not
  compute a weighted score, as intended.

**Phase 4 — wire into daily screening: OPEN.**
- No cron job or UI calls `/api/property-lookup` today. `crawl.yml` only
  calls `/api/crawl`. This is the concrete next step once Scott decides
  whether the daily Cowork screening task should call this endpoint for
  hard-criteria pass/fail (never as a substitute for the full 9-point
  analysis or anything requiring professional verification).

---

## 6. Explicit non-goals for this endpoint

Unchanged — still accurate:

- Does not fetch or parse tilstandsrapport/elinstallationsrapport PDFs.
- Does not resolve weblager.dk building-case history.
- Does not make a final buy/no-buy recommendation.
- Does not persist results — it's a stateless GET, no
  `screening_results`/`property_lookup_results` table exists or is
  planned.

---

## 7. Open questions — status confirmed 30 July 2026

1. **Datafordeler account: resolved, no longer blocking Phase 1–3.** The
   live blocker is different from what was originally assumed: the
   BBR/Matriklen/VUR **GraphQL schema field and entity names are
   unverified** against Datafordeler's live docs (this environment can't
   reach `datafordeler.dk`). Verifying those before flipping
   `BBR_MOCK_MODE` / `MATRIKEL_MOCK_MODE` / `EJENDOMSVURDERING_MOCK_MODE`
   to `false` is the real remaining Phase-0-equivalent task.
2. **Same repo vs. separate service: resolved.** Built inside the
   existing repo (`apps/web`), per the modular structure — confirmed
   working as intended, avoids duplicating shared types.
3. **GrunddataAPI build-vs-buy: still not decided.** Doesn't block
   Phase 1–3, which are already built directly against Datafordeler.
   Adapter interfaces are already thin (one file per source under
   `enrichment-sources/`), so this stays a reversible decision — revisit
   once BBR/VUR go live and the friction of maintaining three separate
   GraphQL clients is actually felt.
4. **New:** `EnrichmentSource` (`packages/shared/src/types/index.ts`)
   and the Supabase `enrichments.source` CHECK constraint both still
   carry an `"ois"` literal that nothing in the codebase ever sets
   (VUR/`ejendomsvurdering.ts` never tags itself `"ois"`). Cosmetic dead
   code, not blocking — worth a small cleanup pass whenever someone's
   touching that enum next.
5. **Confirm real financing thresholds with Scott** — every default in
   `financing-assumptions.ts` is a placeholder (`TODO(scott)`), per
   README "Manual follow-up steps" item 10. Not a code gap, a
   data-confirmation task.
