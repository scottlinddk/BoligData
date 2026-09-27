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
    jq '{ok, error, reports}' response.json
    return 1
  fi
}

if [ "${RUN_MODE:-api}" = "verify" ]; then
  request '{"mode":"verify"}'
  jq '{counts, targetFound, samples}' response.json
  exit 0
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
    jq '{counts, targetFound, samples}' response.json
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
