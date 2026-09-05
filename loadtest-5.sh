#!/usr/bin/env bash
# Fires 5 renders at dursel-service-test simultaneously, to see whether the queue holds the
# fifth back instead of letting it slow the four already running.
#
# Five distinct user ids because startRender caps one account at 3 renders a day and counts
# failures. The same prompt for all five on purpose: it keeps scene complexity constant so the
# durations are comparable, and it exercises the job-id collision fix at the same time — five
# identical prompts in the same second used to produce one id.
set -euo pipefail
cd "$(dirname "$0")/apps/durslel-web"
set -a; . ./.env.local; set +a
: "${CLERK_SECRET_KEY:?not found in apps/durslel-web/.env.local}"

URL=https://dursel-service-test.ariuntuguldur3.workers.dev/graphql
PROMPT='a point tracing a circle with its x coordinate plotted'
STAMP=$(date +%s)

echo "firing 5 at $(date '+%H:%M:%S') ..."
for i in 1 2 3 4 5; do
  curl -sS "$URL" \
    -H 'Content-Type: application/json' \
    -H "X-Dursel-Service: ${CLERK_SECRET_KEY}" \
    -H "X-Dursel-User: loadtest-${STAMP}-${i}" \
    --data @- <<JSON &
{"query":"mutation(\$p:String!){startRender(prompt:\$p){jobId status}}","variables":{"p":"${PROMPT}"}}
JSON
done
wait
echo
echo "all 5 accepted at $(date '+%H:%M:%S') — user prefix: loadtest-${STAMP}"
