#!/usr/bin/env bash
# Authenticated, resumable API crawl. Secrets come from the workflow environment.
set -euo pipefail

headers=(-H "Authorization: Bearer ${CRON_SECRET}" -H "Content-Type: application/json")
if [ -n "${BYPASS_SECRET:-}" ]; then
  headers+=(-H "x-vercel-protection-bypass: ${BYPASS_SECRET}" -H "x-vercel-set-bypass-cookie: true")
fi

request() {
  local body="$1" http_code
  if ! http_code=$(curl -sS --connect-timeout 10 --max-time 75 -X POST "${VERCEL_URL}/api/crawl" "${headers[@]}" \
    --data "$body" -o response.json -w '%{http_code}'); then
    echo "::error::The crawl API could not be reached. Re-run this workflow to retry persisted progress."
    return 1
  fi
  if [ "$http_code" = "504" ]; then
    echo "::error::The crawl batch exceeded the function execution limit. Previously persisted batches remain saved."
    return 1
  fi
  if ! jq -e 'type == "object"' response.json > /dev/null 2>&1; then
    echo "::error::Crawl returned non-JSON (HTTP $http_code). Check deployment health and protection settings."
    return 1
  fi
  if [ "$http_code" != "200" ] || ! jq -e '.ok == true' response.json > /dev/null; then
    echo "::error::Crawl failed (HTTP $http_code). Cursor has not advanced."
    jq '{ok, error, reports, counters, results, batch}' response.json
    return 1
  fi
}

if [ "${RUN_MODE:-api}" = "verify" ]; then
  request '{"mode":"verify"}'
  jq '{counts, targetFound, samples, targetMarket}' response.json
  exit 0
fi

if [ "${RUN_MODE:-api}" = "original-prices" ]; then
  after_id=${RUN_START_AFTER_ID:-}
  dry_run=${RUN_DRY_RUN:-true}
  if [[ "$dry_run" != "true" && "$dry_run" != "false" ]]; then
    echo "::error::dry_run must be true or false."
    exit 1
  fi
  uuid_pattern='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  if [[ -n "$after_id" && ! "$after_id" =~ $uuid_pattern ]]; then
    echo "::error::start_after_id must be a property UUID or empty."
    exit 1
  fi
  after_id=${after_id,,}
  totals='{}'
  batch_size=8
  for ((batch=1; batch<=10000; batch++)); do
    echo "Original-price batch $batch: dryRun=$dry_run afterId=${after_id:-start}"
    body=$(jq -cn --arg cursor "$after_id" --argjson dry "$dry_run" --argjson size "$batch_size" \
      '{mode:"original-prices",dryRun:$dry,batchSize:$size,afterId:(if $cursor == "" then null else $cursor end)}')
    request "$body"
    if ! jq -e --arg cursor "$after_id" --argjson dry "$dry_run" --argjson size "$batch_size" \
      '.mode == "original-prices" and .dryRun == $dry and .batch.afterId == (if $cursor == "" then null else $cursor end) and .batch.batchSize == $size and (.results | type == "array") and (.counters | type == "object")' response.json > /dev/null; then
      echo "::error::The deployed API does not support the original-price backfill contract. Deploy it before running this mode."
      exit 1
    fi
    jq -c '{batch,counters,results}' response.json
    totals=$(jq -cn --argjson previous "$totals" --argjson current "$(jq '.counters' response.json)" \
      '$previous as $p | reduce ($current | to_entries[]) as $e ($p; .[$e.key] = ((.[$e.key] // 0) + $e.value))')
    next=$(jq -r '.batch.nextAfterId' response.json)
    if [ "$next" = "null" ]; then
      jq -cn --argjson dry "$dry_run" --argjson counters "$totals" \
        '{event:"original-prices.completed",dryRun:$dry,counters:$counters}'
      echo "Stored listing enumeration completed. Review every outcome; missing source evidence is not a recovered original price."
      if jq -e '.unavailable // 0 | . > 0' <<< "$totals" > /dev/null; then
        echo "::error::Some source requests were unavailable. All stored rows were classified; rerun to retry those lookups. Saved evidence is retained."
        exit 1
      fi
      exit 0
    fi
    if [[ ! "$next" =~ $uuid_pattern || ( -n "$after_id" && ! "$next" > "$after_id" ) ]]; then
      echo "::error::The API returned an invalid or non-advancing property cursor."
      exit 1
    fi
    after_id=$next
  done
  echo "::error::Reached the original-price batch limit; resume with start_after_id=$after_id."
  exit 1
fi

offset=${RUN_START_OFFSET:-0}
if ! [[ "$offset" =~ ^[0-9]{1,5}$ ]]; then
  echo "::error::start_offset must be an integer from 0 to 50000."
  exit 1
fi
# Avoid interpreting leading zeroes as octal in arithmetic checks.
offset=$((10#$offset))
if ((offset > 50000)); then
  echo "::error::start_offset must be an integer from 0 to 50000."
  exit 1
fi
batch_size=8
for ((batch=1; batch<=625; batch++)); do
  echo "Starting batch $batch at offset=$offset"
  request "{\"offset\":$offset,\"batchSize\":$batch_size}"
  if ! jq -e --argjson offset "$offset" --argjson size "$batch_size" \
    '.batch.offset == $offset and .batch.batchSize == $size and (.reports | type == "array")' response.json > /dev/null; then
    echo "::error::The deployed API does not support this batch contract. Deploy the batching change before running it."
    exit 1
  fi
  jq -r '.reports[] | "[\(.source)] fetched=\(.fetched) updated=\(.upserted) enriched=\(.enriched) unchanged=\(.enrichSkippedUnchanged) skippedInvalid=\(.skippedInvalid) dbErrors=\(.dbErrors)"' response.json
  if [ "$batch" = "1" ]; then
    jq -r '.reports[] | .mappingWarnings[]? | "::warning::" + .' response.json
  fi
  next=$(jq -r '.batch.nextOffset' response.json)
  total=$(jq -r '.batch.total' response.json)
  echo "Batch $batch completed; offset=$offset total=$total next=$next"
  if [ "$next" = "null" ]; then
    request '{"mode":"verify"}'
    jq '{counts, targetFound, samples, targetMarket}' response.json
    exit 0
  fi
  if ! [[ "$next" =~ ^[0-9]+$ ]] || ((next <= offset || next > 50000)); then
    echo "::error::The API returned an invalid next cursor."
    exit 1
  fi
  offset=$next
done
echo "::error::Reached the bounded batch limit; persisted records are retained."
exit 1
