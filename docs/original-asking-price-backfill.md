# Original asking-price evidence

The authenticated production crawl API can audit and backfill the original asking price for every stored property. It enumerates property UUIDs without filtering out sources, statuses, or legacy provenance. Every row receives an explicit outcome; enumeration completion does not mean every original price was available.

The source lookup binds a Boligsiden case ID to its own source address, unique active case, and the oldest opening in the public address timeline that belongs to the source's total marketing period. A change of broker must not reset the original asking price. Boligsiden exposes both the current listing duration (`timeOnMarket.current.days`) and the total duration (`timeOnMarket.total.days`); the total duration bounds the complete marketing history, while the current duration identifies the current broker's listing. Use the exact amount on the selected `open` event, never an amount reconstructed from a percentage.

The source timeline must still reconcile with the active listing and its current price. Earlier sales, unrelated marketing periods, inconsistent duration/price evidence, and ambiguous history are not silently joined. When the source omits total duration entirely, the older current-listing resolver remains a fallback, explicitly marked `priceScope: current_listing`. A present but malformed or contradictory total duration cannot fall back to a shorter period. Unsupported sources, blocked requests, and missing evidence are reported without inventing values.

## Production procedure

Apply `026_off_market_properties.sql`, then deploy the production API and frontend before dispatching this workflow. The frontend must understand the evidence version and label retained off-market favorites. The existing `VERCEL_URL`, `CRON_SECRET`, and optional `VERCEL_AUTOMATION_BYPASS_SECRET` repository secrets authenticate the request. The API uses its existing production service-role database connection; no new credentials are required or printed.

1. Run a read-only audit from the deployed default branch:

   ```sh
   gh workflow run crawl.yml --ref main -f mode=original-prices -f dry_run=true
   ```

2. Inspect that run's `Original-price batch` output and final `original-prices.completed` counters. Each result contains the property ID, stored source/status/provenance, outcome, and any exact source original/date. New total-period results also include `priceScope: total_marketing_period` and `totalDays`. Check several listings, including broker changes and ordinary single-broker listings. Unresolved source results include a bounded reason code when available. Review `conflict`, `ambiguous_episode`, `unavailable`, unsupported identities, and missing evidence separately.

3. Persist the same source checks:

   ```sh
   gh workflow run crawl.yml --ref main -f mode=original-prices -f dry_run=false
   ```

4. Run another audit to verify `already_present` for saved originals and inspect unresolved rows. A transient failure to reach the source (network error, timeout, or an HTTP error status; reason `source_request_failed`, `source_deadline_exceeded`, `source_search_failed`, or `http_<status>`) makes the workflow fail after all rows have been classified, so a successful enumeration cannot hide a retryable source failure. Re-run from the beginning to retry those; source-backed evidence already saved is retained. Other `unavailable` reasons (for example `bounded_search` or `invalid_case_search_shape`) mean the source answered but the case could not be confirmed; re-running the same data will not change that outcome, so the workflow reports them as a warning instead of failing the job. Review those reason codes directly.

The job uses batches of eight properties with at most four concurrent source lookups. The API permits batch sizes from one to eight, with an explicit boolean `dryRun` and optional UUID `afterId`:

```json
{"mode":"original-prices","dryRun":true,"batchSize":8,"afterId":null}
```

Responses provide `batch.afterId`, `batch.batchSize`, `batch.total`, and `batch.nextAfterId`, plus aggregate counters and one compact result per property. A null next cursor indicates the final page only when `ok` is true. The exact total is the current stored count, not a frozen snapshot. Concurrent inserted UUIDs behind the cursor are covered by the next complete run; the workflow serializes production refresh jobs to avoid normal refresh overlap.

For an interrupted run, resume after the last fully successful cursor shown in its logs:

```sh
gh workflow run crawl.yml --ref main -f mode=original-prices -f dry_run=false -f start_after_id=PROPERTY_UUID
```

Database read/write failures return `ok:false` and HTTP 502 without advancing the cursor. Repeating that batch is safe even if some rows were already saved. HTTP failures stop immediately and log the current cursor. Source lookup failures are reported per row and do not prevent the remaining stored properties from being audited.

## What changes

Dry runs perform no database writes, including no campaign or episode creation. Write runs add deterministic `source_observations` entries with field `original_asking_price`, method `source_reported_original_asking`, real provenance, original/date, exact source case identity, and available timeline provenance. Evidence keys include the selected episode so retries deduplicate without mixing listing periods.

Validated total-period observations use `source_version: original-price-backfill/v2` and include `priceScope: total_marketing_period` and the observed total duration. The existing `scope: listing` and current `episode_id` still bind the evidence to the verified active case; they do not claim that its earliest opening belongs to the latest broker. The original date may precede the current episode's start. A later refresh with the same original/date is idempotent even though the source's duration increases.

The v1 backfill selected the current broker's opening. Those observations remain intact for auditing, but a valid v2 total-period observation for the same case and episode supersedes their interpretation. This is an explicit derivation-version correction: it does not delete records or hide disagreements from other versions or within v2. Conflicting v2 evidence continues to display as a conflict. A subsequent current-listing fallback cannot downgrade already proven total-period evidence. Rerun the original-price write backfill after deployment to correct existing listings.

An unresolved total-history lookup remains in the backfill report and does not erase previously saved evidence. If only valid v1/current-listing evidence remains, the frontend explicitly labels its amount “Oprindelig pris hos nuværende mægler” / “Original price with current agent” and explains that the original for the full marketing period is not yet documented. The existing workbook calculation can continue using that clearly labelled input; its arithmetic is unchanged. Only validated total-period evidence restores the generic original-asking-price label for these refreshed observations.

If the live source confirms the exact active case, a matching unknown-provenance episode may be promoted to real/active while retaining its existing chronology. Missing shared campaign and episode links use the regular crawler's canonical keys; a minimal episode has an unknown start instead of a fabricated date. Ambiguous episodes or a closed episode occupying the canonical key are reported for reconciliation. Conflicting original-price observations within the same interpretation remain additive and explicitly marked as conflicts.

The price-evidence path does not update `properties`, current asking prices, first-listing events, sales, descriptions, areas, or enrichment tables. Today's asking price may narrow source discovery but never becomes the original asking price.

## Source-confirmed removals

The same refresh checks whether Boligsiden explicitly reports an address off market, with no current cases. Cleanup requires an existing verified link between the stored listing's exact source case and that source address. A missing result in a bounded feed, a failed request, an ambiguous address, or a generic `not_current` result never authorizes removal. A removal does not prove a sale.

Migration 026 provides a service-role-only transaction that rechecks this identity and the property snapshot. If any user has favorited the property, it is retained with status `withdrawn`, its matching current shared episode is marked `removed`, and a verified market-status observation is saved. No end date or sale price is invented. The UI labels it “Fjernet fra markedet” / “Removed from market,” labels the amount as the last asking price, and stops active listing-day counters.

If nobody has favorited it, the property is deleted along with listing-specific records covered by existing foreign-key cascades, including unsaved assessments and listing history. Conversations remain with their property link cleared. The property row lock serializes the favorite check with concurrent favorite inserts, and changed `updated_at` or `last_seen_at` values produce `stale` instead of retiring a newer listing. Dry runs only read and report `would_remove` or `would_withdraw`; write runs report `removed` or `withdrawn`. Review these counters alongside price-evidence outcomes.

## Ongoing refresh

Scheduled daily and weekly refreshes trigger a separate original-price job after the relevant ingest job succeeds. It uses the same protected API and production concurrency group, and rechecks existing originals, so v1 rows are upgraded during normal scheduled refreshes. Manual listing refreshes do not invoke this scheduled follow-up; dispatch `original-prices` separately when verifying a manual refresh. Manual `original-prices` dispatch remains available for audits, resumptions, and retries. Unresolved source lookups remain visible in the report; any retained current-listing evidence is explicitly labelled in the UI. Stored evidence conflicts remain visible instead of being substituted with today's price.
