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

**Postal code (postnummer) scope**: both clients only keep listings whose postal code falls within `CRAWL_ZIP_MIN`-`CRAWL_ZIP_MAX` (`server/lib/crawl/map-utils.ts`, `getZipRange`/`filterByZipRange`), defaulting to **9000-9900** (North Jutland). The filter runs client-side after mapping — correct regardless of whether the upstream API's own zip params (best-effort, sent to Boliga's search endpoint) do anything — so widening or narrowing coverage later is just an env var change, no code change or redeploy of logic required.

The ingest orchestrator (`apps/web/server/lib/crawl/ingest.ts`, exposed as `/api/crawl`) isolates the two sources (`Promise.allSettled`), batch-upserts properties in chunks, and only re-enriches listings that are new or changed — each listing's payload is fingerprinted into `properties.content_hash` (migration 005). A source that hits a fetch error and comes back with zero listings is treated as failed too, so a blocked or drifted upstream API can't masquerade as "nothing new this run." The endpoint returns per-source reports and responds `502` on partial failure so the daily GitHub Action (`crawl.yml`) goes red with the report in its log; `crawl.yml` parses that JSON and prints, per source and in total, how many listings were found and how many were brand new.

Enrichment (`enrich.ts`) is still **mock-only**: real Datafordeler (BBR/DAR), OIS, and Vejdirektoratet clients await credentials. It is gated by its own `ENRICH_MOCK_MODE` flag (default mock), deliberately independent of `CRAWL_MOCK_MODE`, so flipping the fetchers live doesn't crash the run on the not-yet-implemented enrichment path. An enrichment failure is counted per-source in the crawl report rather than aborting the run — already-upserted properties stay landed, and the next run heals missing enrichment rows.

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
4. Verify the unofficial API field mappings against one live payload per source (run a crawl with `CRAWL_MOCK_MODE=false CRAWL_MAX_PAGES=1 CRAWL_PAGE_SIZE=10`) — the last production crawl came back with zero listings from both sources, so the field mappings or the outbound request itself likely need investigating. Register for Datafordeler credentials to unlock real BBR/OIS enrichment.
