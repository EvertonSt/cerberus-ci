#!/bin/bash
set -euo pipefail

# Cerberus CI — GitHub Action entrypoint
# This script orchestrates the full pipeline: ingest → classify → gate → report

echo "🐕‍🦺 Cerberus CI — Quality Gate"
echo "================================"

# Resolve run ID
RUN_ID="${INPUT_RUN_ID:-${GITHUB_RUN_ID}}"
if [ -z "$RUN_ID" ]; then
  echo "❌ Error: No run ID provided"
  exit 1
fi

# Set API key environment variable based on provider
if [ "${INPUT_AI_PROVIDER}" = "claude" ] && [ -n "${INPUT_AI_API_KEY:-}" ]; then
  export ANTHROPIC_API_KEY="${INPUT_AI_API_KEY}"
elif [ "${INPUT_AI_PROVIDER}" = "openai-compatible" ] && [ -n "${INPUT_AI_API_KEY:-}" ]; then
  export OPENAI_API_KEY="${INPUT_AI_API_KEY}"
fi

# Determine branch
BRANCH="${INPUT_BRANCH:-${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-main}}}"
PR_NUMBER="${INPUT_PR_NUMBER:-${GITHUB_EVENT_PULL_REQUEST_NUMBER:-}}"

# Step 1: Ingest
echo ""
echo "📥 Step 1: Ingesting test results..."
cerberus ingest \
  --input "${INPUT_TEST_RESULTS_PATH}" \
  --format "${INPUT_FORMAT:-playwright-json}" \
  --run-id "$RUN_ID" \
  --commit "${GITHUB_SHA}" \
  --branch "$BRANCH" \
  ${PR_NUMBER:+--pr "$PR_NUMBER"} \
  --config "${INPUT_CONFIG_PATH:-cerberus.config.yml}" || {
  echo "❌ Ingestion failed"
  exit 1
}

# Step 2: Classify
echo ""
echo "🔍 Step 2: Classifying failures..."
cerberus classify \
  --run-id "$RUN_ID" \
  --config "${INPUT_CONFIG_PATH:-cerberus.config.yml}" || {
  echo "⚠️  Classification encountered issues (continuing)"
}

# Step 3: Gate
echo ""
echo "🚦 Step 3: Evaluating gate..."
GATE_EXIT=0
ANNOTATIONS_FLAG=""
if [ "${INPUT_ANNOTATIONS:-false}" = "true" ]; then
  ANNOTATIONS_FLAG="--annotations"
fi
cerberus gate \
  --run-id "$RUN_ID" \
  --config "${INPUT_CONFIG_PATH:-cerberus.config.yml}" \
  $ANNOTATIONS_FLAG || GATE_EXIT=$?

# Step 4: Report (only on PRs)
if [ -n "$PR_NUMBER" ] && [ "${INPUT_SKIP_REPORT:-false}" != "true" ]; then
  echo ""
  echo "📝 Step 4: Generating report..."
  cerberus report \
    --run-id "$RUN_ID" \
    --pr "$PR_NUMBER" \
    --repo "${GITHUB_REPOSITORY}" \
    --config "${INPUT_CONFIG_PATH:-cerberus.config.yml}" || {
    echo "⚠️  Report generation failed (non-fatal)"
  }
fi

# Step 5: Read the counts back for downstream steps.
#
# This used to re-run the entire pipeline under a second run id
# ("${RUN_ID}-report") just to get JSON out of it. That duplicated the ingest,
# wrote a phantom run into the database, and - because `run` called
# process.exit() while its stdout was still buffered - handed the script an
# empty string and a libuv assertion, so the counts below came back 0 even
# when the gate had just found regressions.
#
# `status` reads the run that is already there. Nothing is written twice.
echo ""
echo "📊 Results:"
RESULT_JSON=$(cerberus status \
  --run-id "$RUN_ID" \
  --json \
  --config "${INPUT_CONFIG_PATH:-cerberus.config.yml}" 2>/dev/null || echo '{}')

# Set outputs using GITHUB_OUTPUT
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  GATE_RESULT="pass"
  if [ "$GATE_EXIT" -ne 0 ]; then
    GATE_RESULT="fail"
  fi
  # Tolerate whitespace around the colon: `status --json` pretty-prints.
  FLAKY_COUNT=$(printf '%s' "$RESULT_JSON" | grep -o '"flakyCount"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')
  REGRESSION_COUNT=$(printf '%s' "$RESULT_JSON" | grep -o '"regressionCount"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$')

  echo "gate-result=$GATE_RESULT" >> "$GITHUB_OUTPUT"
  # An unreadable count must not silently become 0, which reads as "nothing
  # found" rather than "could not tell". Fail loudly instead.
  if [ -z "$FLAKY_COUNT" ] || [ -z "$REGRESSION_COUNT" ]; then
    echo "::error::could not read flaky/regression counts from 'cerberus status --json'."
    echo "::error::status returned: ${RESULT_JSON:-<empty>}"
  fi
  echo "flaky-count=${FLAKY_COUNT:-0}" >> "$GITHUB_OUTPUT"
  echo "regression-count=${REGRESSION_COUNT:-0}" >> "$GITHUB_OUTPUT"
fi

echo ""
if [ "$GATE_EXIT" -eq 0 ]; then
  echo "🐕‍🦺 Cerberus: All gates PASSED ✅"
else
  echo "🐕‍🦺 Cerberus: Gate FAILED ❌"
fi

exit $GATE_EXIT
