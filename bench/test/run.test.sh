#!/usr/bin/env bash
# runner_records_capped_run: a capped run still yields a row, hidden tests still run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
mkdir -p "$TMP/fixtures/f-test/repo" "$TMP/fixtures/f-test/hidden-tests"
echo "spec" > "$TMP/fixtures/f-test/repo/SPEC.md"
echo '{"hidden_total":8}' > "$TMP/fixtures/f-test/meta.json"
export PATH="$ROOT/bench/test/stubs:$PATH"
export BENCH_CLAUDE=claude BENCH_FIXTURES="$TMP/fixtures" BENCH_WORK="$TMP/work" BENCH_RESULTS="$TMP/results"
"$ROOT/bench/run.sh" --exp ET --arm claude-skills --fixture f-test --rep 1 --budget 1 >/dev/null
ROW="$TMP/results/raw/ET/claude-skills__f-test__1.json"
node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const assert = require("assert/strict");
assert.equal(r.status, "capped");
assert.equal(r.cost_usd, 2.5);
assert.deepEqual(r.hidden, { passed: 5, failed: 3 });
assert.equal(r.review_score, 6);
assert.equal(r.judge_cost_usd, 0.5);
assert.deepEqual(r.model_cost_usd, { "claude-haiku-4-5": 1.0 });
assert.deepEqual(r.plugins_loaded, ["claude-skills"]);
console.log("ok runner_records_capped_run");
' "$ROW"
