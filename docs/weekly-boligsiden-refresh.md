# Weekly Boligsiden refresh

The **Property refresh (daily and weekly)** workflow runs the Boligsiden ingest on a GitHub Actions runner every Monday at **04:17 UTC** (05:17 Copenhagen in winter, 06:17 in summer). The existing daily 03:00 UTC API refresh continues. Both write paths share the `boligdata-crawl-production` concurrency group, so they cannot update listings simultaneously.

The scheduled runner uses `--weekly`. To run the same refresh manually, select **Actions → Property refresh (daily and weekly) → Run workflow → mode=weekly**. The workflow must be merged into the default branch and Actions schedules enabled before automatic runs occur. GitHub may delay a scheduled start.

## Configuration and credentials

The runner pulls the existing Vercel production environment with repository Actions secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`. If Vercel redacts protected values as `[SENSITIVE]`, supply repository Actions secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; these override the downloaded values. The runner refuses redacted database credentials before creating a database client.

`DATAFORDELER_API_KEY` is an optional Actions secret for register enrichment. Missing credentials or unavailable register services leave those facts unavailable. They do not substitute fixture data. Environment files are not logged or uploaded and are removed in an always-run cleanup step.

Weekly mode selects **Boligsiden only** and explicitly disables all crawl/enrichment mock flags, including per-register flags. It preserves the production postcode scope (`CRAWL_ZIP_RANGES`, or legacy `CRAWL_ZIP_MIN`/`CRAWL_ZIP_MAX`), page size, delay, timeout and concurrency. Without an explicit scope, the existing default is **9000–9900**. Adjust the production scope to expand coverage; an all-Denmark workbook does not silently expand the listing crawl.

## Coverage and saved data

Weekly mode raises the safety bounds to **1,000 pages / 50,000 source records** and allows **180 minutes** for the job. It continues beyond the first 5,000 newest records so older active listings can refresh. The ordinary API limits and optional manual `mode=runner` full-scan limits are unchanged.

For scopes of at most 300 postcode values, the request includes every code. Broader scopes fetch the national feed and apply the complete postcode filter locally. This avoids silently sending just the first 300 codes. A valid, unambiguous source postcode excludes out-of-area records before full listing validation, so an unrelated plot without a dwelling area cannot make local coverage fail. Unknown or conflicting postcodes remain incomplete coverage. Every raw record still consumes the record bound, including excluded, malformed and duplicate records; the cap is not a promise that 50,000 in-area listings can be processed. Repeated pages are detected even when every record is out of area.

Success requires real source data, exhausted pagination and successful database writes. A page or record cap, malformed record, repeated page, missing source page or database failure leaves the workflow failed rather than reporting a full refresh. Pagination uses actual returned records, so an upstream page-size limit cannot cause premature success. With no advertised total, the crawler requests an empty terminal page to confirm exhaustion.

For every observed listing the existing ingest updates the asking price, `last_seen_at`, listing history and dated source-reported liggetid. This happens even if the asking price is unchanged. New source sales and stale enrichment are refreshed by the same pipeline. No inferred listing start date or disappearance is introduced: an unseen listing is not marked sold or withdrawn, even after a scan. A moving paginated feed is not a historical snapshot.

## Checking a run

Check the `crawl.runner_config` log for effective postcode ranges and caps. `crawl.boligsiden.scope` reports the upstream total and whether postcode narrowing was sent. `crawl.runner_summary` must report `ok: true` and `complete: true`; the source report identifies skipped records and database failures. Read-only provenance verification runs before and after ingestion.

If the run fails, saved observations remain in the database. Correct unavailable credentials, source mapping, coverage limits or upstream availability, then rerun `mode=weekly`. A timeout is also a failed run; it must not be read as complete coverage. Existing rows update idempotently on retry. The manual `mode=verify` checks current database evidence through the API without writing.

Implementation and fixture tests do not establish that production credentials are configured or that a production refresh has completed. Confirm the first scheduled/manual run in Actions after merging.
