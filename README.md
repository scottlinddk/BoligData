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

The ingest orchestrator (`apps/web/server/lib/crawl/ingest.ts`, exposed as `/api/crawl`) isolates the two sources (`Promise.allSettled`), batch-upserts properties in chunks, and only re-enriches listings that are new or changed — each listing's payload is fingerprinted into `properties.content_hash` (migration 005). The endpoint returns per-source reports and responds `502` on partial failure so the daily GitHub Action (`crawl.yml`) goes red with the report in its log.

Enrichment (`enrich.ts`) is still **mock-only**: real Datafordeler (BBR/DAR), OIS, and Vejdirektoratet clients await credentials.

## Manual follow-up steps (cannot be done via this session's tooling)

1. Set `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` in the Vercel project's Environment Variables.
2. Set `VERCEL_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` as GitHub Actions repo secrets so `.github/workflows/crawl.yml` can call `/api/crawl`.
3. Apply migration `packages/supabase/migrations/005_crawl_metadata.sql` to the Supabase project.
4. Verify the unofficial API field mappings against one live payload per source (run a crawl with `CRAWL_MOCK_MODE=false CRAWL_MAX_PAGES=1 CRAWL_PAGE_SIZE=10`), then flip `CRAWL_MOCK_MODE=false` for the daily cron. Register for Datafordeler credentials to unlock real BBR/OIS enrichment.
