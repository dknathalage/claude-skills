#!/usr/bin/env bash
# Run one PR-review fixture headless and score the draft against the human checklist.
# Same flags as run.sh, so compare.sh can use it:  --runner bench/run-review.sh
#   bench/run-review.sh --exp E --arm A --fixture ID --rep 1 [--budget 2] [--model M] [--timeout-min 15]
# Env: BENCH_PLUGIN_DIR (skills to load), BENCH_FIXTURES (dir holding the fixture), BENCH_RESULTS, BENCH_WORK, BENCH_CLAUDE.
# The agent works in a folder holding only input/ (PR description + diff). The checklist never enters it.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_BIN="${BENCH_CLAUDE:-claude}"
WORKROOT="${BENCH_WORK:-$HOME/.cache/claude-skills-bench/work}"
RESULTS="${BENCH_RESULTS:-$ROOT/bench/results}"
PLUGIN_DIR="${BENCH_PLUGIN_DIR:-$ROOT}"
EXP= ARM= FIXTURE= REP= BUDGET=2 MODEL="${REVIEW_MODEL:-claude-opus-5-5}" TIMEOUT_MIN=15
while [ $# -gt 0 ]; do
  case "$1" in
    --exp) EXP=$2; shift 2 ;; --arm) ARM=$2; shift 2 ;; --fixture) FIXTURE=$2; shift 2 ;; --rep) REP=$2; shift 2 ;;
    --budget) BUDGET=$2; shift 2 ;; --model) MODEL=$2; shift 2 ;; --timeout-min) TIMEOUT_MIN=$2; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$EXP" ] && [ -n "$ARM" ] && [ -n "$FIXTURE" ] && [ -n "$REP" ] || { echo "need --exp --arm --fixture --rep" >&2; exit 2; }
FIX="${BENCH_FIXTURES:?BENCH_FIXTURES}/$FIXTURE"
NAME="${ARM}__${FIXTURE}__${REP}"
WORK="$WORKROOT/$EXP/$NAME"
rm -rf "$WORK" && mkdir -p "$WORK" "$RESULTS/raw/$EXP"
cp -R "$FIX/input" "$WORK/input"

START=$(node -e 'console.log(Date.now())')
( cd "$WORK" && node "$ROOT/bench/lib/with-timeout.mjs" "$(node -e 'console.log(Math.max(1,Math.round(process.argv[1]*60)))' "$TIMEOUT_MIN")" "$WORK/transcript.jsonl" "$WORK/stderr.log" -- \
    "$CLAUDE_BIN" -p "$(cat "$ROOT/bench/prompts/driver-review.md")" --model "$MODEL" --output-format stream-json --verbose \
    --plugin-dir "$PLUGIN_DIR" --setting-sources project,local --permission-mode acceptEdits \
    --allowedTools Read Write Grep Glob --max-budget-usd "$BUDGET" )
RC=$?
END=$(node -e 'console.log(Date.now())')
DRAFT=0; [ -s "$WORK/draft.md" ] && DRAFT=1
[ "$DRAFT" = 1 ] && "$ROOT/bench/judge-review.sh" "$FIX/reference/checklist.json" "$WORK/draft.md" > "$WORK/judge.json" 2>> "$WORK/stderr.log"
BASE=$(node -e 'console.log(JSON.stringify({exp:process.argv[1],arm:process.argv[2],fixture:process.argv[3],rep:Number(process.argv[4]),wall_ms:Number(process.argv[5]),timed_out:process.argv[6]==="124",session_model:process.argv[7]}))' "$EXP" "$ARM" "$FIXTURE" "$REP" "$((END - START))" "$RC" "$MODEL")
node "$ROOT/bench/lib/review-row.mjs" "$WORK/transcript.jsonl" "$WORK/judge.json" "$FIX/reference/checklist.json" "$DRAFT" "$BASE" > "$RESULTS/raw/$EXP/$NAME.json"
echo "$RESULTS/raw/$EXP/$NAME.json"
