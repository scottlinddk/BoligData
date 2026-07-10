# DanBolig Research

Research and due-diligence dashboard for Danish property investors and advisors. Ingests listings, enriches with BBR/OIS/public reference data, and surfaces a structured due-diligence checklist per property.

## Stack

- Frontend: React 19 + TypeScript + Vite, React Router v7 (data router mode), TanStack Query v5, MapLibre GL + OpenFreeMap tiles, Tailwind CSS.
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

`apps/web/api/lib/crawl/{boligsiden,boliga,enrich}.ts` are built as clean interfaces behind a `CRAWL_MOCK_MODE` flag. Real scraping of Boligsiden/Boliga and real BBR/OIS/Vejdirektoratet API clients are **not implemented yet** — mock mode reads from local fixtures so the rest of the app (search, map, detail, comparables) is fully demoable against seeded data.

## Infrastructure status

- Supabase project `bolig-data` (`hfqswyafdnfjzegasqpq`, `eu-west-1`) is provisioned; migrations `001`-`004` are applied and seed data is loaded.
- Vercel project `bolig-data-web` is linked to this GitHub repo. Production deploys of `main` were previously failing to build — see "Manual follow-up steps" below, item 3, now fixed on this branch (moved `api/lib` + `api/middleware` to `apps/web/server/` so Vercel's function-file scanner no longer counts helper files as functions, and fixed an `assert`/`with` import-attribute syntax error).

## Manual follow-up steps (cannot be done via this session's tooling)

1. Set `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` in the Vercel project's Environment Variables.
2. Set `VERCEL_URL`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` as GitHub Actions repo secrets so `.github/workflows/crawl.yml` can call `/api/crawl`.
3. ~~Fix the production build failure~~ (fixed on this branch — see "Infrastructure status" above). Once merged, trigger a new deploy of `main` and confirm the production alias goes green.
4. Implement real Boligsiden/Boliga scrapers and real BBR/OIS/Vejdirektoratet API clients, then flip `CRAWL_MOCK_MODE=false`.
