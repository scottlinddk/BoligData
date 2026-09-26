# Listing facts and data recovery

The September 2026 research migration left existing listings with unknown provenance. Those records correctly failed the new evidence rules, but the page presented the same empty decision and valuation cards on every listing. The last successful crawl predated the migration. A content-hash check also skipped unchanged enrichments without checking their provenance or freshness.

## Property page

The overview shows each listing's available asking price, advertised area and rooms, price per advertised m², and listing time. A reported listing date can supply clearly labelled elapsed days even when pauses/relistings are unresolved; these days never become documented valuation evidence. Real registered transactions and nearby sales appear independently of BBR availability. Unknown historical area prevents a per-m² comparison, but no longer suppresses a genuine transaction amount/date.

Private budget and family decisions require a configured project. Unsaved starter values no longer produce the generic documentation verdict or a printable budget decision. The evidence overview also remains available when loading the private workspace fails.

The price calculation keeps its existing eligibility rules. A valid reference without time matching is prominent and explicitly labelled. An unavailable reference explains the actual missing evidence in a compact panel. No current asking-price multiplier, mock transaction or inferred historical area fills the gap.

Market history now filters real sales by the subject's municipality, property type and the last 24 months before pagination. Previously, the latest 500 records nationwide could omit the relevant municipality. The 2,000-record bound is explicit; a partially included cutoff date is discarded to avoid separating conflicting duplicate records.

## Crawl recovery

Only a new live observation establishes real provenance. An unchanged listing is re-enriched when source provenance is absent, sources failed, mock/live settings changed, or its enrichment is at least seven days old. Mock sources require an explicit mock flag. Unavailable credentials or an upstream failure stay unavailable.

Normalized history writes use bounded concurrency. Enrichment writes persist in small batches, prioritizing missing/older records so an interrupted run retains progress. Partial crawls still never infer that an unseen listing was removed or sold.

The **Daily property crawl** GitHub Actions workflow provides:

- `mode=api`: the existing scheduled API invocation.
- `mode=verify`: read-only production provenance counts and a small sample of public listing facts.
- `mode=runner`: the same ingest pipeline on an Actions runner, avoiding the API function's execution limit. Its optional full scan increases bounded pagination within the configured source/postcode scope.

The runner pulls the existing Vercel production configuration using existing repository secrets. Vercel substitutes `[SENSITIVE]` for protected values, so deployments with protected database credentials also require repository Actions secrets named `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. These override the downloaded placeholders. `DATAFORDELER_API_KEY` is optional for register enrichment; without an available key those registers remain unavailable. Add credentials through GitHub's secret settings, never a commit or workflow log. Verification refuses missing protected database values before making any database request.

The workflow does not print environment values or upload them as artifacts, and removes the downloaded environment in an always-run cleanup step. Verification can run before refreshing. Refresh refuses explicit global mock crawl/enrichment settings. No new database migration is required.

After the runner secrets are configured, dispatch `crawl.yml` with `mode=verify` on the reviewed branch. Check provenance counts and the target listing's `last_seen_at`. Then dispatch `mode=runner` with `full_scan=true` for recovery; compare the before/after counts and samples. Full scan is bounded to 100 pages / 5,000 listings per source and preserves configured source/postcode filters. The routine API crawl does not require these additional Actions secrets.

Production verification attempted on 26 September 2026 confirmed the protected-value limitation before any database access. Consequently, this change does not claim a completed production refresh.

## Checks

Focused tests cover refresh selection, bounded concurrency, malformed source responses, real transactions without historical area, property-scoped history, and listing-evidence calculations. Browser fixtures cover a fresh legacy record, independent live sales with unavailable BBR, a baseline-only reference and mock exclusion. Run `SMOKE_SCENARIO=sparse` with `scripts/research-browser-smoke.cjs`; `SMOKE_THEME=dark` repeats the flow in dark mode. The complete configured-project flow remains covered separately. These fixtures validate behavior, not production source availability.
