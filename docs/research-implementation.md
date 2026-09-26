# Property research before a viewing

Implementation of the supplied 26 September 2026 feature plan, reconciled against repository commit `9334f59e380c2abb34a6a8e18ade532e4e2e6ab6`. The original brief is preserved in [research-feature-plan.da.md](research-feature-plan.da.md).

## Using the workflow

Sign in and open **Boligprojekt / Buying project** (`/research`). Find an already collected listing by address or its exact stored listing URL, then open the property. The research card sits above the existing property information. It gives one of four next actions, with separate suitability, economy and documentation states.

The private project starts with editable values of DKK 5,000,000 for the entire project, 130 residential m² and three legal bedrooms. These are initial values in a user's project, not global screening rules. Record accepted types, areas, personal exclusions, buying tracks and preferences. Changing the project recalculates candidates without rewriting observations.

Each property has editable budget lines, area and bedroom evidence with source references, hard requirements, questions, private notes, document links, comparable choices and an editable broker draft. Save explicitly. Every assessment save creates an immutable revision containing the project and the then-current listing snapshot. A later price or status change is shown in the property workspace with its budget impact. This is an in-app comparison on opening the page, not an email/push service.

The budget has base and stress scenarios, explicit VAT treatment, assumption/estimate/quote status, sources, dates, required and deferred work, and reserves already included in quotes. Empty costs remain unknown; removing a required cost from a scenario leaves it incomplete. A budget fixture of 5,000,000 minus 150,000 costs, 650,000 work and 200,000 reserve yields 4,000,000 for purchase. These costs are never prefilled as universal rates. A scenario below asking requires price clarification, even when affordable.

Broker drafts support first contact, price discussion, relisting and follow-up. They accept an independently entered discussion price only after an explicit checkbox. They do not automatically disclose the ceiling, maximum purchase price, reserve or financing assumptions, and there is no send operation. The print pack and downloaded research JSON are **private** and deliberately contain the buyer's budget; they are distinct from the broker draft.

## Listing price reference

Each active real listing now shows an indicative purchase price from comparable completed sales and its documented time on market. The primary reference is the median sold price per residential m² multiplied by the listing's residential area. It uses the same recorded property type and municipality, an area range of ±25%, sales within the previous 24 months, and the same time definition and duration bracket (0–30, 31–90, 91–180, 181–365 or over 365 days). These fixed rules are recorded in the exported method snapshot; the buyer's minimum-area requirement, budget and current asking price do not enter the calculation.

The estimate requires at least five unique eligible transactions, with a warning for fewer than ten. The middle 50% of area-adjusted historical prices supplies the Q1–Q3 range. The card shows transaction and property counts, the asking-price gap, the supporting sales, and a separate reference without time matching. Missing duration data does not silently turn that baseline into a time-adjusted estimate. A separate first-asking-price calculation is available only with a documented first price in the current campaign and at least five historical first-asking/sold pairs. It is never added to the m² result or applied as another reduction to today's asking price.

Only real, normal, completed sales with a usable residential area documented at the sale date qualify. Duplicate or conflicting identities, the subject's own earlier sales, unknown/mock data, future observations and manually excluded transactions are withheld. Source dates and current listing identities determine the latest episode; overlapping active periods count once, pauses are excluded, unknown periods stay unknown, and technical first-seen timestamps never become listing dates. Truncated history cannot establish a first asking price or a complete active total. The UI lets the user choose the documented time definition; a missing definition or too few matching sales gives an explicit insufficient-data result.

The comparison relates an ongoing listing's elapsed age to completed sales' durations. It is descriptive evidence, not a causal discount for waiting, a predicted selling time, a confidence interval or a probability of bid acceptance. Condition, plot size, exact location within the municipality and market price changes are not adjusted. Current source feeds often lack historical marketing durations and sale-date area, so references can remain unavailable until suitable historical data is imported. No sample transactions are inserted into production.

The price reference appears in the private print pack and JSON snapshot. The snapshot includes the subject inputs, method/data versions, calculation date, filters, exact source transactions and exclusions so the calculation can be reproduced. **Use as budget scenario** is an explicit local choice; the estimate does not automatically alter the purchase scenario, family requirements or broker draft. Saving remains explicit.

## Coverage of the plan

| Plan | Implemented behavior |
| --- | --- |
| F01–F03 | Private project, three-state criteria, decision card, 2–4 saved-candidate comparison, documented residential area and legal bedrooms, total project budget with base/stress scenarios. |
| F04–F05 | Normalized campaigns, episodes, source observations, price/status events and sales; separate active/latest/calendar definitions; signed total and last-price reductions; no first-price inference from today's asking price. |
| F06–F07 | Completed/live/normal transactions only by default, five time groups, mean/median/Q1/Q3 and denominators, missingness and exclusions, address/type/area/price/date/month/time/condition filters, scatter-to-table focus, map bounds and drawn polygon filters, per-trade sources, manual inclusion/exclusion with reasons, exported reproducible analyses. |
| F08–F09 | Versioned multi-signal Danish text rules, negation and historical-period checks, strict renovation selection, source statuses/conflicts, document links with manual classification and page references, questions, immutable revisions and printable packs. |
| F10 | Editable drafts with explicit disclosure choice and no automatic sending or unsupported financing/takeover claims. |
| F11 | Existing register/maps remain available; separate source-backed research requirements and document links for noise, school district, planning, tenure and multiple units. Area questions can be added to the research. No automatic legal conclusion or partial-sale budget credit. |
| F12 | Saved decision revisions and in-app price/status changes against the last saved listing snapshot. |
| Data/import | Additive migration, source provenance, atomic private XLSX/CSV/TSV preview and commit, exact identity matching, quarantine, deduplication and reconciliation, live/mock separation, incomplete crawl status and authenticated register lookup quota. |

The staged plan's later work remains explicit: automatic future-infrastructure/school-district feeds, continuous notification delivery/new-comparable alerts, financing calculators when assumptions are supplied, legal subdivision determinations, automated document diagnosis and advanced valuation/survival models are not implemented. District values and spatial boundaries are not invented. The app stores document **links**, not private file uploads. The charts currently provide a price-fall scatter, map and five time groups; a separate seasonal heatmap and valuation-model charts remain future visualizations.

## Historical data and identity

The named `Boligsalg_Aalborg_Hasseris_med_prislofter.xlsx` workbook was not supplied and has not been imported. No historical control totals are claimed as newly verified.

The import screen reads `.xlsx` in the browser using a lazy-loaded ExcelJS chunk, or CSV/TSV. It exposes worksheet and column mapping, collection time, file/version provenance and source mode before preview. Formula cells are omitted rather than importing old rankings or computed valuations. Limits are 5 MB, 2,000 rows per sheet and 100 columns.

Import rows require the **exact existing BoligData property/unit UUID**. Unknown or ambiguous mappings remain quarantined; there is no address-distance or fuzzy identity merge. Correct the source mapping and preview a new batch to resolve a quarantined row. Entire properties and individual units must be matched manually to the correct existing identity. This implementation does not create historical property identities from addresses or automatically merge duplicate listings across sources.

Prices, transfer type, area definition, first/last asking price and the three time definitions map separately. Month-only dates retain monthly precision and are excluded from exact-day statistics. Missing historical area or period-matched text cannot satisfy those filters. Family/auction transfers remain history but are excluded from the default arm's-length reference. Real source mode must be chosen explicitly; unlabelled, demo and mock imports are excluded from production references.

Preview retains every accepted/rejected/duplicate/quarantined row and reconciles the old 437/317/281 and 79/77/65/44/16 controls against the **new accepted selection**, without forcing agreement. Commit runs in a database transaction and is idempotent. Download the complete import log. Imports are private to the importing account.

## Deployment order

1. Apply `packages/supabase/migrations/023_research_foundation.sql` to a staging database, then the target database **before deploying this code**. Earlier migrations must already exist. The migration adds nullable listing dates, provenance, normalized research history, private projects/assessments/revisions, import staging and a register quota function.
2. Deploy the web/API code. Research is dispatched through existing `/api/account?resource=research-*` routes, keeping the 12-function Vercel budget.
3. Run a permitted live crawl with sources and credentials configured. Existing records default to unknown provenance; a subsequent observed live crawl establishes real provenance. Nothing marks all legacy values as trustworthy, and the migration does not fabricate historical listing dates.
4. Smoke-test sign-in, project/assessment save and revision retrieval, workbook preview/commit, property history and source statuses. Verify the real upstream feeds separately; local tests do not establish external availability or data-use rights.

The register lookup endpoint now requires an authenticated account and an atomic per-account limit of 30 lookups per hour. It returns `private, no-store`; clients that previously called it anonymously must supply a bearer token. The rate limiter fails closed when the migration/function is unavailable. No public cached family profile is exposed.

Do not enable mock flags for production references. Crawls report `complete` separately from success and never infer removals from absent listings in a partial feed. New registered sales change the enrichment fingerprint independently of asking price. First observation remains technical metadata. Confirmed relists create a separate episode with an unknown restart date when no source date exists. Historical sales are not attached to current listing text or prices.

## Validation

Final local check on 26 September 2026: **447 tests in 46 files passed**, shared/frontend/server TypeScript checks passed, and the production build passed. Vite reports a bundle-size advisory; ExcelJS is loaded only when opening an XLSX import. Thirteen mocked browser checks passed, including the time-matched 4 million price reference and 3.9–4.1 million historical range, minimum-sample suppression and manual exclusions, snapshot export, explicit budget selection, the 4 million purchase cap, hard rejection at 116 m², draft privacy, private save requests, a 390-pixel mobile layout without document overflow and the printable viewing pack. No real account or upstream network response was used by the browser test.

Standard checks: `pnpm typecheck`, `pnpm test`, `pnpm build`. The repository pins pnpm 10.33.0. On environments whose wrapper uses a different pnpm version, the same installed tools can be invoked directly from `apps/web`: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`, repeat for `tsconfig.api.json`, `node node_modules/vitest/vitest.mjs run`, and `node node_modules/vite/bin/vite.js build`.

Tests cover the specified arithmetic, negative reductions, missing first price, overlap-free active periods, 447 versus 91 days, basement/bedroom requirements, private exclusions, unknown costs, VAT/covered reserves, condition text/negation and period association, one-reference warnings, normal/live-only populations, duplicate/conflicting transactions, map bounds/polygons, spreadsheet provenance and quarantine, null/mocked register facts, partial crawling, registration-only changes, authentication and quota behavior. The native-workbook test generates a synthetic XLSX; it does not substitute for validating the missing user workbook.

Migration verification uses an isolated local PostgreSQL-compatible database and synthetic auth roles. It exercises row-level isolation, revision triggers, protected import staging, cross-user commit denial, idempotent atomic import and per-account rate limits. No production database, external account, broker message or deployment has been changed by this implementation task.

Reusable optional checks are `scripts/research-browser-smoke.cjs` (a local Vite server plus Playwright/Chromium) and `scripts/verify-research-migration.mjs` (PGlite). Both document their runtime inputs and operate entirely on local fixtures. The browser script intercepts or blocks every external request.
