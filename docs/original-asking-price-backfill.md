# Original asking-price evidence

The authenticated production crawl API can audit and backfill the original asking price for every stored property. It enumerates property UUIDs without filtering out sources, statuses, or legacy provenance. Every row receives an explicit outcome; enumeration completion does not mean every original price was available.

The source lookup binds a Boligsiden case ID to its own source address, unique active case, and a unique opening in the public address timeline corroborated by the current time on market. Its subsequent price changes must agree with the active case. Continuous same-price pauses are permitted when there is no intervening sale. An address match alone, today's asking price, a different campaign, or an old sold listing cannot supply an original asking price. Unsupported sources, blocked requests, ambiguous history, and missing evidence are reported without inventing values.

## Production procedure

Deploy the change to the production API before dispatching this workflow. The existing `VERCEL_URL`, `CRON_SECRET`, and optional `VERCEL_AUTOMATION_BYPASS_SECRET` repository secrets authenticate the request. The API uses its existing production service-role database connection; no new credentials are required or printed.

1. Run a read-only audit from the deployed default branch:

   ```sh
   gh workflow run crawl.yml --ref main -f mode=original-prices -f dry_run=true
   ```

2. Inspect that run's `Original-price batch` output and final `original-prices.completed` counters. Each result contains the property ID, stored source/status/provenance, outcome, and any exact source original/date. Unresolved source results include a bounded reason code when available. Review `conflict`, `ambiguous_episode`, `unavailable`, unsupported identities, and missing evidence separately.

3. Persist the same source checks:

   ```sh
   gh workflow run crawl.yml --ref main -f mode=original-prices -f dry_run=false
   ```

4. Run another audit to verify `already_present` for saved originals and inspect unresolved rows. Unavailable source requests make the workflow fail after all rows have been classified, so a successful enumeration cannot hide retryable source failures. Re-run from the beginning to retry them; source-backed evidence already saved is retained.

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

If the live source confirms the exact active case, a matching unknown-provenance episode may be promoted to real/active while retaining its existing chronology. Missing shared campaign and episode links use the regular crawler's canonical keys; a minimal episode has an unknown start instead of a fabricated date. Ambiguous episodes or a closed episode occupying the canonical key are reported for reconciliation. Conflicting original-price observations remain additive and explicitly marked as conflicts.

The backfill does not update `properties`, current asking prices, first-listing events, sales, descriptions, areas, or enrichment tables. Today's asking price may narrow source discovery but never becomes the original asking price.

## Ongoing refresh

Scheduled daily and weekly refreshes trigger a separate original-price job after the relevant ingest job succeeds. It uses the same protected API and production concurrency group. Manual `original-prices` dispatch remains available for audits, resumptions, and retries. A source conflict or genuinely unavailable original remains visible in the report and UI rather than being substituted with today's price.
