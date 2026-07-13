# BoligData

**BoligData** (Danish) / **BoligDataResearch** (English) — a research and due-diligence dashboard for Danish property investors and advisors. Ingests listings, enriches with BBR/OIS/public reference data, and surfaces a structured due-diligence checklist per property.

The UI is fully bilingual (Danish default, English) and ships with light and dark themes; both preferences persist in `localStorage`.

## Stack

- Frontend: React 19 + TypeScript + Vite, React Router v7 (data router mode), TanStack Query v5, MapLibre GL + OpenFreeMap tiles, Tailwind CSS.
- i18n: lightweight in-house dictionary + context provider (`apps/web/src/i18n`), no runtime dependency.
- Theming: Tailwind `class` dark mode with a context provider (`apps/web/src/theme`); an inline bootstrap in `index.html` applies the stored theme before first paint to avoid flashes.
- Backend: Vercel serverless functions (`apps/web/api`), Node.js.
- Database: Supabase (PostgreSQL + PostGIS), Supabase Auth.
- Ingest: GitHub Actions daily cron -> `/api/crawl`.

## Monorepo layout

```
apps/web            # Vite frontend + Vercel /api functions
packages/shared      # shared TS types + utils, consumed via Vite alias
packages/supabase    # SQL migrations + seed data
.github/workflows    # crawl.yml (daily ingest), deploy.yml
```

## Getting started

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in local values if needed
pnpm dev          # runs apps/web
pnpm typecheck
pnpm build
```

The committed `apps/web/.env.production` holds the real (non-secret) Supabase URL + publishable key used for production builds.

## Data ingest status

Real Boliga and Boligsiden clients live in `apps/web/server/lib/crawl/{boliga,boligsiden}.ts`, behind the `CRAWL_MOCK_MODE` flag (default `true`, which reads local fixtures so the app stays demoable against seeded data). Instead of HTML scraping, they call the **unofficial JSON APIs** that boliga.dk's and boligsiden.dk's own frontends use — far more reliable than parsing markup, but unauthenticated and undocumented, so field shapes may drift. The clients defend against that: per-record mapping skips and counts malformed entries, requests have timeouts and retry with backoff (honoring `Retry-After`), pagination is capped (`CRAWL_MAX_PAGES` / `CRAWL_MAX_LISTINGS`), and pages are fetched with a polite delay.

**Boliga is currently blocked from Vercel** (confirmed 2026-07-10): every request gets `HTTP 403` from datacenter IPs, and browser-like headers (UA, Referer/Origin, `sec-ch-*`) didn't change that, so it's an IP-range block rather than a fingerprint check. Boligsiden has no such block and ingests live data cleanly. Use `CRAWL_SOURCES` (comma-separated, e.g. `CRAWL_SOURCES=boligsiden`) to run only the working source(s) — unset, empty, or containing no recognized source name falls back to both. Re-enable Boliga once it's reachable again (a residential/rotating proxy in front of that one client, or a different execution host).

**Postal code (postnummer) scope**: both clients only keep listings whose postal code falls within `CRAWL_ZIP_MIN`-`CRAWL_ZIP_MAX` (`server/lib/crawl/map-utils.ts`, `getZipRange`/`filterByZipRange`), defaulting to **9000-9900** (North Jutland). The filter runs client-side after mapping — correct regardless of whether the upstream API's own zip params (best-effort, sent to Boliga's search endpoint) do anything — so widening or narrowing coverage later is just an env var change, no code change or redeploy of logic required.

The ingest orchestrator (`apps/web/server/lib/crawl/ingest.ts`, exposed as `/api/crawl`) isolates the two sources (`Promise.allSettled`), batch-upserts properties in chunks, and only re-enriches listings that are new or changed — each listing's payload is fingerprinted into `properties.content_hash` (migration 005). A source that hits a fetch error and comes back with zero listings is treated as failed too, so a blocked or drifted upstream API can't masquerade as "nothing new this run." The endpoint returns per-source reports and responds `502` on partial failure so the daily GitHub Action (`crawl.yml`) goes red with the report in its log; `crawl.yml` parses that JSON and prints, per source and in total, how many listings were found and how many were brand new.

Enrichment (`enrich.ts`) is still **mock-only** by default, gated by its own `ENRICH_MOCK_MODE` flag (default mock), deliberately independent of `CRAWL_MOCK_MODE`. An enrichment failure is counted per-source in the crawl report rather than aborting the run — already-upserted properties stay landed, and the next run heals missing enrichment rows. Individual real data sources live under `apps/web/server/lib/enrichment-sources/`, one file per source, each with its own `..._MOCK_MODE` flag and failure-isolated via `Promise.allSettled` — one source erroring doesn't blank out the others:

- **Address/cadastral** (`address-lookup.ts`): DAWA/Adressevælger lookup, no auth. DAWA (`dawa.aws.dk`) is being retired ~2026-08-17 in favor of "Adressevælger" (same address UUID) — verify the live Adressevælger response shape before flipping `ADDRESS_LOOKUP_MOCK_MODE=false`. Resolves `properties.id_lokalid`/`matrikelnr`/`ejerlav`/`zone` for every property during ingest (migration 010).
- **Soil type** (`geus-jordart.ts`): GEUS Jordartskort, no auth. Supplementary context only (permeability/radon), never authoritative for contamination status.
- **Soil contamination** (`miljoeportalen-v1v2.ts`): Danmarks Miljøportal's V1/V2 "Forurenede grunde" registry, expected no auth — endpoint/layer name not yet verified against live docs (403'd automated research fetches). Authoritative source for the due-diligence checklist's "no marking for soil contamination registered" vs. V1/V2 status.
- **Encumbrance** (`tinglysning-link.ts`): tinglysning.dk (the Danish land register) has no open API, so this stays a pure derivation — builds a deep link from `matrikelnr`/`ejerlav` so an advisor can pull the real tingbogsattest themselves, rather than an automated true/false.
- **BBR** (`bbr.ts`): Datafordeler's entity-based BBR GraphQL service (`https://graphql.datafordeler.dk/BBR/<version>`, per Klimadatastyrelsen's "Transitionsguide for GraphQL-tjenester" v2.3), requires a `DATAFORDELER_API_KEY` (still pending — same blocker OIS/Vejdirektoratet enrichment awaits). Auth is an API key query parameter — the old REST-style `DATAFORDELER_USERNAME`/`DATAFORDELER_PASSWORD` "tjenestebruger" login only works for fetching the GraphQL schema, not for querying entity data, so it can't be reused here. Once live, upgrades `oilTankRisk` from the `buildingYear < 1970` heuristic to BBR's real `byg056Varmeinstallation` (heating installation) field — verify that field name against the live schema (`.../BBR/v1/schema?apiKey=...`) before flipping `BBR_MOCK_MODE=false`, since `datafordeler.dk` wasn't reachable to confirm directly during this session; falls back to the heuristic when BBR is unavailable.
- **Noise** (`stoejkort.ts`): Miljøstyrelsens "Støj-Danmarkskortet" (road/rail traffic noise, Lden metric), served via a WFS on `geoserver.plandata.dk` under a "Noise Map" theme group. Miljøstyrelsen states access to that group requires contacting them directly, so this isn't a fully open self-serve endpoint (same shape of blocker as BBR/Datafordeler) — the exact layer name and auth requirements are unverified. Confirm both against a live `GetCapabilities` response before flipping `STOEJKORT_MOCK_MODE=false`.
- **Sewer separation** (`spildevandsplan.ts`): no unified national API exists for municipal spildevandsplaner (each of Denmark's ~98 municipalities publishes independently), so this stays a pure derivation like `tinglysning-link.ts` — a static lookup table of municipality → spildevandsplan site, scoped to the municipalities within the crawl's current postal-code range (`CRAWL_ZIP_MIN`/`CRAWL_ZIP_MAX`, 9000-9900, Region Nordjylland). Always advisory (`sewerSeparationCheckRequired: true`), same as the encumbrance check — an automated true/false per property isn't possible without per-municipality integration.
- **Matriklen** (`matrikel.ts`): Datafordeler's cadastral-parcel GraphQL service (`https://graphql.datafordeler.dk/Matrikel/<version>`, "Matrikel"/"MAT2" in the object type catalog), reusing the same `DATAFORDELER_API_KEY` as BBR — no separate credential. Resolves `properties.registered_area_sqm` (migration 012) from the `Jordstykke` entity's `registreretAreal` field, keyed by the `matrikelnr`/`ejerlav` pair `address-lookup.ts` already resolves (not `id_lokalid` — parcels aren't addresses). Verify the exact field name against the live schema (`.../Matrikel/v2/schema?apiKey=...`) before flipping `MATRIKEL_MOCK_MODE=false`, since `datafordeler.dk` wasn't reachable to confirm directly during this session.

**Grunddatamodeller considered but not built**: researching Datafordeler's Grunddatamodellen (grunddatamodel.datafordeler.dk) and Dataoversigt (datafordeler.dk/dataoversigt) for further integration turned up **EJF (Ejerfortegnelsen, the ownership register)** as the highest-value remaining candidate — real registered owner vs. listing agent is a strong due-diligence signal BoligData doesn't have today. It's deliberately not built yet: EJF requires a separate access request to Geodatastyrelsen with **MitID Erhverv + OAuth**, and explicitly cannot be accessed with an API key, unlike every other source in this list. That's a new authorization process, not just a missing credential, so it's a distinct follow-up rather than a `MOCK_MODE` flip.

**Vercel Deployment Protection**: if the Vercel project has Deployment Protection (Vercel Authentication) enabled, unauthenticated requests to `/api/crawl` are redirected to a login page instead of reaching the handler — `crawl.yml` will report this as a JSON-parse failure rather than silently "succeeding". Either disable protection for the production deployment, or generate a Protection Bypass for Automation secret (Vercel dashboard: Project Settings → Deployment Protection) and set it as the `VERCEL_AUTOMATION_BYPASS_SECRET` GitHub Actions repo secret.

## Infrastructure status

- Supabase project `bolig-data` (`hfqswyafdnfjzegasqpq`, `eu-west-1`) is provisioned; migrations `001`-`005` are applied and seed data is loaded.
- Vercel project `bolig-data-web` is linked to this GitHub repo.

## Search access levels

`GET /api/properties` (`apps/web/server/lib/search.ts`) returns different shapes depending on whether the request carries a valid Supabase session (`Authorization: Bearer <jwt>`):

- **Anonymous**: only `summaries: { id, address }[]` plus the paged `total`/`limit`/`offset`/`page`/`totalPages` — enough to see how many listings match a filter and their address, nothing else. This is enforced by selecting fewer columns server-side (`search.ts`), not just hidden in the UI.
- **Signed in**: the full `properties: Property[]` array (price, sqm, images, agent, etc.), same as before.

Page size is caller-configurable (`limit`/`offset` query params, exposed in the UI as a page-size selector) up to `SEARCH_MAX_PAGE_SIZE` (default 100), which can be raised or lowered later via env var alone.

`GET /api/properties/:id` (detail: price, sold-price history, risk flags, BBR data) and `GET /api/properties/:id/comparables` require the same signed-in session — both now 401 without a valid `Authorization: Bearer <jwt>`, and the frontend's `/property/:id` route is wrapped in `AuthGuard` so anonymous visitors are redirected to sign-in before the page ever calls those endpoints. All three authenticated responses are sent with `Cache-Control: private, no-store` so a CDN can never serve one caller's data to another.

## Manual follow-up steps (cannot be done via this session's tooling)

1. Set `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` in the Vercel project's Environment Variables.
2. Set `VERCEL_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` as GitHub Actions repo secrets so `.github/workflows/crawl.yml` can call `/api/crawl`. If the Vercel project has Deployment Protection enabled, also set `VERCEL_AUTOMATION_BYPASS_SECRET` (see "Vercel Deployment Protection" above) — otherwise the workflow's requests never reach the handler.
3. ~~Apply migration `packages/supabase/migrations/005_crawl_metadata.sql` to the Supabase project.~~ Done — confirmed applied.
4. Done — a live trial (`CRAWL_MOCK_MODE=false`) confirmed Boligsiden's field mappings and ingested a real listing end-to-end; Boliga is blocked (`HTTP 403` from Vercel's IPs, see "Data ingest status" above) and disabled via `CRAWL_SOURCES=boligsiden` until that's resolved. `DATAFORDELER_API_KEY` is now set in Vercel — still need to verify the live BBR/Matriklen GraphQL schemas (field names) against it before flipping `BBR_MOCK_MODE`/`MATRIKEL_MOCK_MODE` to `false` (see "Data ingest status" above); this sandbox can't reach `datafordeler.dk` to do that verification directly.
5. ~~Apply migration `packages/supabase/migrations/010_cadastral_fields.sql` (adds `properties.id_lokalid`/`matrikelnr`/`ejerlav`/`zone`) to the Supabase project.~~ Done — confirmed applied.
6. Verify the live Adressevælger (DAWA replacement), Miljøportalen "Forurenede grunde" WFS, and GEUS Jordartskort endpoint shapes before flipping `ADDRESS_LOOKUP_MOCK_MODE`/`MILJOEPORTALEN_MOCK_MODE`/`GEUS_MOCK_MODE` to `false` — none of these were reachable for schema verification during this session (DAWA is mid-deprecation; Miljøportalen 403'd automated fetches).
7. ~~Apply migration `packages/supabase/migrations/012_matrikel_parcel_area.sql` (adds `properties.registered_area_sqm`) to the Supabase project.~~ Done — confirmed applied.
8. `public.spatial_ref_sys` (a PostGIS system table, not application data) has Row Level Security disabled — flagged by a routine advisory check, not something introduced by this session's changes. Decide whether to `ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;`; not applied automatically since it's a security-posture decision, not a bug fix.
