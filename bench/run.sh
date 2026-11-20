#!/usr/bin/env bash
# Run one headless benchmark session and record a result row.
#
#   bench/run.sh --exp E1 --arm swarm --fixture f-medium --rep 1 \
#     [--plugin claude-skills|superpowers] [--budget 15] [--prompt bench/prompts/x.md] \
#     [--args-json '{"isolation":"worktree"}'] [--model claude-opus-5-5]
#
# Writes $BENCH_RESULTS/raw/<exp>/<arm>__<fixture>__<rep>.json and keeps the
# work folder (transcript, hidden-test log, judge output) under $BENCH_WORK.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURES="${BENCH_FIXTURES:-$ROOT/bench/fixtures}"
WORKROOT="${BENCH_WORK:-$ROOT/bench/work}"
RESULTS="${BENCH_RESULTS:-$ROOT/bench/results}"
SUPERPOWERS_DIR="${SUPERPOWERS_DIR:-$HOME/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.2}"
PERMISSION_MODE="${BENCH_PERMISSION_MODE:-auto}"

EXP= ARM= FIXTURE= REP= PLUGIN= BUDGET=15 PROMPT= ARGS_JSON='{}' MODEL=claude-opus-5-5
while [ $# -gt 0 ]; do
  case "$1" in
    --exp) EXP=$2; shift 2 ;;
    --arm) ARM=$2; shift 2 ;;
    --fixture) FIXTURE=$2; shift 2 ;;
    --rep) REP=$2; shift 2 ;;
    --plugin) PLUGIN=$2; shift 2 ;;
    --budget) BUDGET=$2; shift 2 ;;
    --prompt) PROMPT=$2; shift 2 ;;
    --args-json) ARGS_JSON=$2; shift 2 ;;
    --model) MODEL=$2; shift 2 ;;
    *) echo "unknown arg $1" >&2; exit 2 ;;
  esac
done
[ -n "$EXP" ] && [ -n "$ARM" ] && [ -n "$FIXTURE" ] && [ -n "$REP" ] || { echo "need --exp --arm --fixture --rep" >&2; exit 2; }
[ -n "$PLUGIN" ] || { [[ "$ARM" == superpowers* ]] && PLUGIN=superpowers || PLUGIN=claude-skills; }
[ "$PLUGIN" = superpowers ] && PLUGIN_DIR="$SUPERPOWERS_DIR" || PLUGIN_DIR="$ROOT"
[ -n "$PROMPT" ] || PROMPT="$ROOT/bench/prompts/driver-$PLUGIN.md"

FIX="$FIXTURES/$FIXTURE"
NAME="${ARM}__${FIXTURE}__${REP}"
WORK="$WORKROOT/$EXP/$NAME"
REPO="$WORK/repo"
rm -rf "$WORK" && mkdir -p "$WORK" "$RESULTS/raw/$EXP"
cp -R "$FIX/repo" "$REPO"
if [[ "$PROMPT" == *planned* ]]; then
  mkdir -p "$REPO/docs/plans"
  cp "$FIX/plan.json" "$REPO/docs/plans/$(date +%F)-fixture.json" 2>/dev/null
  cp "$FIX/plan.md" "$REPO/docs/plans/$(date +%F)-fixture.md" 2>/dev/null
fi
( cd "$REPO" && git init -q -b main && git add -A && git -c user.email=bench@local -c user.name=bench commit -qm "fixture start" )
BASE_SHA="$(git -C "$REPO" rev-parse HEAD)"

DRIVER="$(cat "$PROMPT")"
DRIVER="${DRIVER//\{\{ARGS_JSON\}\}/$ARGS_JSON}"

now_ms() { node -e 'console.log(Date.now())'; }
START=$(now_ms)
( cd "$REPO" && claude -p "$DRIVER" \
    --model "$MODEL" \
    --output-format stream-json --verbose \
    --plugin-dir "$PLUGIN_DIR" \
    --setting-sources project,local \
    --permission-mode "$PERMISSION_MODE" \
    --max-budget-usd "$BUDGET" \
  > "$WORK/transcript.jsonl" 2> "$WORK/stderr.log" )
END=$(now_ms)

# Hidden tests, run on whatever the session left behind.
if [ -d "$FIX/hidden-tests" ]; then
  cp -R "$FIX/hidden-tests" "$REPO/hidden-tests"
  ( cd "$REPO" && dotnet test hidden-tests > "$WORK/hidden.log" 2>&1 )
fi

# Blind review: the judge sees the spec and the diff, never the arm.
git -C "$REPO" add -A >/dev/null 2>&1
git -C "$REPO" diff "$BASE_SHA" --cached -- . ':(exclude)hidden-tests' > "$WORK/diff.patch" 2>/dev/null
"$ROOT/bench/judge.sh" "$REPO/SPEC.md" "$WORK/diff.patch" > "$WORK/judge.json" 2>> "$WORK/stderr.log"

BASE_ROW=$(node -e 'console.log(JSON.stringify({exp:process.argv[1],arm:process.argv[2],fixture:process.argv[3],rep:Number(process.argv[4]),wall_ms:Number(process.argv[5]),plugin:process.argv[6],session_model:process.argv[7],args:JSON.parse(process.argv[8])}))' \
  "$EXP" "$ARM" "$FIXTURE" "$REP" "$((END - START))" "$PLUGIN" "$MODEL" "$ARGS_JSON")
node "$ROOT/bench/lib/parse-run.mjs" "$WORK/transcript.jsonl" "$WORK/hidden.log" "$WORK/judge.json" "$FIX/meta.json" "$BASE_ROW" \
  > "$RESULTS/raw/$EXP/$NAME.json"
echo "$RESULTS/raw/$EXP/$NAME.json"
