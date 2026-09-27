# Listing facts and data recovery

The September 2026 research migration left existing listings with unknown provenance. Those records correctly failed the new evidence rules, but the page presented the same empty decision and valuation cards on every listing. The last successful crawl predated the migration. A content-hash check also skipped unchanged enrichments without checking their provenance or freshness.

## Property page

The overview shows each listing's available asking price, advertised area and rooms, price per advertised m², and listing time. Boligsiden's `timeOnMarket.current.days` is preserved as a dated source observation and shown as source-reported time when documented chronology is unavailable. The observation must match the current source listing and episode. It never becomes an invented start date, total active campaign time or valuation input. A reported listing date can also supply clearly labelled elapsed days even when pauses/relistings are unresolved. Real registered transactions and nearby sales appear independently of BBR availability. Unknown historical area prevents a per-m² comparison, but no longer suppresses a genuine transaction amount/date.

Private budget and family decisions require a configured project. Unsaved starter values no longer produce the generic documentation verdict or a printable budget decision. The evidence overview also remains available when loading the private workspace fails.

The price calculation keeps its existing eligibility rules. A valid reference without time matching is prominent and explicitly labelled. An unavailable reference explains the actual missing evidence in a compact panel. No current asking-price multiplier, mock transaction or inferred historical area fills the gap.

Market history now filters real sales by the subject's municipality, property type and the last 24 months before pagination. Previously, the latest 500 records nationwide could omit the relevant municipality. The 2,000-record bound is explicit; a partially included cutoff date is discarded to avoid separating conflicting duplicate records.

## Crawl recovery

Only a new live observation establishes real provenance. An unchanged listing is re-enriched when source provenance is absent, sources failed, mock/live settings changed, or its enrichment is at least seven days old. Mock sources require an explicit mock flag. Unavailable credentials or an upstream failure stay unavailable.

Normalized history writes use bounded concurrency. Enrichment writes persist in small batches, prioritizing missing/older records so an interrupted run retains progress. Partial crawls still never infer that an unseen listing was removed or sold.

Malformed individual source records are excluded and counted as mapping warnings. These warnings do not block valid records or batch advancement. Failed page requests, invalid page shapes and database errors remain failures and keep the batch cursor unchanged. A feed containing excluded records still reports incomplete coverage.

The **Daily property crawl** GitHub Actions workflow provides:

- `mode=api`: the scheduled API refresh, eight listings per request. Stable source identities determine the batch order; each successful response supplies the next offset. Database/source failures do not advance it. An interrupted manual run can resume using `start_offset` from the last log entry.
- `mode=verify`: read-only production provenance counts and a small sample of public listing facts through the same authenticated API. This uses existing runtime credentials; no extra Actions secrets are needed.
- `mode=runner`: the same ingest pipeline on an Actions runner, avoiding the API function's execution limit. Its optional full scan increases bounded pagination within the configured source/postcode scope.

The runner pulls the existing Vercel production configuration using existing repository secrets. Vercel substitutes `[SENSITIVE]` for protected values, so deployments with protected database credentials also require repository Actions secrets named `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. These override the downloaded placeholders. `DATAFORDELER_API_KEY` is optional for register enrichment; without an available key those registers remain unavailable. Add credentials through GitHub's secret settings, never a commit or workflow log. Verification refuses missing protected database values before making any database request.

The workflow does not print environment values or upload them as artifacts, and removes the downloaded environment in an always-run cleanup step. Verification can run before refreshing. Refresh refuses explicit global mock crawl/enrichment settings. No new database migration is required.

Deploy the API batching change before dispatching the updated workflow. Run `mode=verify` and check provenance counts and the target listing's `last_seen_at`, then `mode=api` to refresh within the configured source/postcode scope. The workflow verifies counts and samples again when all batches finish. API refresh and full runner jobs share a concurrency group to prevent overlapping writes. The loop is bounded to 625 batches and 45 minutes. Each batch refetches the current feed, so membership changes during a run can shift offsets; incomplete coverage never establishes a removal.

For the optional full runner, configure its separate credentials and dispatch `mode=runner` with `full_scan=true`. Full scan is bounded to 100 pages / 5,000 listings per source and preserves configured source/postcode filters. The routine API crawl and API verification do not require these additional Actions secrets.

Production runner verification attempted on 26 September 2026 confirmed the protected-value limitation before any database access. A subsequent full API refresh hit `FUNCTION_INVOCATION_TIMEOUT` at 60 seconds, confirming the need for batching. Neither attempt establishes a completed production refresh; writes made before the timeout may persist.

## Checks

Focused tests cover refresh selection, bounded concurrency, malformed source responses, real transactions without historical area, property-scoped history, and listing-evidence calculations. Browser fixtures cover a fresh legacy record, independent live sales with unavailable BBR, a baseline-only reference and mock exclusion. Run `SMOKE_SCENARIO=sparse` with `scripts/research-browser-smoke.cjs`; `SMOKE_THEME=dark` repeats the flow in dark mode. The complete configured-project flow remains covered separately. These fixtures validate behavior, not production source availability.
