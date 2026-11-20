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

# runner_records_timeout: a session past its wall-clock limit is killed and recorded as timeout.
STUB_SLEEP=30 "$ROOT/bench/run.sh" --exp ET --arm slow --fixture f-test --rep 1 --budget 1 --timeout-min 0.05 >/dev/null
node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const assert = require("assert/strict");
assert.equal(r.status, "timeout");
assert.ok(r.wall_ms < 20000, `wall ${r.wall_ms}`);
assert.deepEqual(r.hidden, { passed: 5, failed: 3 });
console.log("ok runner_records_timeout");
' "$TMP/results/raw/ET/slow__f-test__1.json"

# runner_leaves_no_watchdog_behind: the run must not leave a sleeping watchdog holding stdout.
S=$(node -e 'console.log(Date.now())')
"$ROOT/bench/run.sh" --exp ET --arm quick --fixture f-test --rep 1 --budget 1 --timeout-min 30 | cat >/dev/null
E=$(node -e 'console.log(Date.now())')
[ $((E - S)) -lt 20000 ] || { echo "FAIL runner_leaves_no_watchdog_behind: piped run took $((E - S)) ms"; exit 1; }
! pgrep -f "sleep 1800$" >/dev/null || { echo "FAIL runner_leaves_no_watchdog_behind: orphan sleep 1800"; pkill -f "sleep 1800$"; exit 1; }
echo "ok runner_leaves_no_watchdog_behind"
