#!/usr/bin/env bash
# Run one headless benchmark session and record a result row.
#
#   bench/run.sh --exp E1 --arm swarm --fixture f-medium --rep 1 \
#     [--plugin claude-skills|superpowers] [--budget 15] [--prompt bench/prompts/x.md] \
#     [--args-json '{"isolation":"worktree"}'] [--model claude-opus-5-5] [--timeout-min 60]
#
# A session still running after --timeout-min (default 60, or BENCH_TIMEOUT_MIN) is
# killed and recorded as status "timeout"; it is still scored on what it left behind.
#
# Writes $BENCH_RESULTS/raw/<exp>/<arm>__<fixture>__<rep>.json and keeps the
# work folder (transcript, hidden-test log, judge output) under $BENCH_WORK.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_BIN="${BENCH_CLAUDE:-$(ls -d "$HOME/Library/Application Support/Claude/claude-code"/*/*/claude.app/Contents/MacOS/claude 2>/dev/null | sort -V | tail -1)}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
FIXTURES="${BENCH_FIXTURES:-$ROOT/bench/fixtures}"
# Work folders must live OUTSIDE the plugin dir: writes under a loaded plugin count as sensitive (E0).
WORKROOT="${BENCH_WORK:-$HOME/.cache/claude-skills-bench/work}"
RESULTS="${BENCH_RESULTS:-$ROOT/bench/results}"
SUPERPOWERS_DIR="${SUPERPOWERS_DIR:-$HOME/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.2}"
PERMISSION_MODE="${BENCH_PERMISSION_MODE:-acceptEdits}"
# Same tool allowance for every arm. Auto mode's classifier gives no verdict inside
# workflow workers (E0), so runs use acceptEdits plus an explicit Bash allowlist.
ALLOWED_TOOLS=(Workflow "Bash(git *)" "Bash(dotnet *)" "Bash(node *)" "Bash(cd *)" "Bash(ls *)" "Bash(cat *)" "Bash(mkdir *)" "Bash(cp *)" "Bash(find *)" "Bash(grep *)" "Bash(head *)" "Bash(tail *)" "Bash(wc *)" "Bash(rm -rf .build*)")
# Headless sessions have workflows off by default; every arm gets the same settings.
RUN_SETTINGS="${BENCH_SETTINGS:-{\"enableWorkflows\":true,\"workflowSizeGuideline\":\"large\"}}"

EXP= ARM= FIXTURE= REP= PLUGIN= BUDGET=15 PROMPT= ARGS_JSON='{}' MODEL=claude-opus-5-5 TIMEOUT_MIN=${BENCH_TIMEOUT_MIN:-60}
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
    --timeout-min) TIMEOUT_MIN=$2; shift 2 ;;
    *) echo "unknown arg $1" >&2; exit 2 ;;
  esac
done
[ -n "$EXP" ] && [ -n "$ARM" ] && [ -n "$FIXTURE" ] && [ -n "$REP" ] || { echo "need --exp --arm --fixture --rep" >&2; exit 2; }
[ -n "$PLUGIN" ] || { [[ "$ARM" == superpowers* ]] && PLUGIN=superpowers || PLUGIN=claude-skills; }
[ "$PLUGIN" = superpowers ] && PLUGIN_DIR="$SUPERPOWERS_DIR" || PLUGIN_DIR="$ROOT"
# compare.sh points a run at an exported snapshot of the skills instead of the live repo.
[ -n "${BENCH_PLUGIN_DIR:-}" ] && PLUGIN_DIR="$BENCH_PLUGIN_DIR"
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
( cd "$REPO" && exec "$CLAUDE_BIN" -p "$DRIVER" \
    --model "$MODEL" \
    --output-format stream-json --verbose \
    --plugin-dir "$PLUGIN_DIR" \
    --add-dir "$PLUGIN_DIR" \
    --setting-sources project,local \
    --permission-mode "$PERMISSION_MODE" \
    --allowedTools "${ALLOWED_TOOLS[@]}" \
    --settings "$RUN_SETTINGS" \
    --max-budget-usd "$BUDGET" \
  > "$WORK/transcript.jsonl" 2> "$WORK/stderr.log" ) &
CPID=$!
TIMEOUT_S=$(node -e "console.log(Math.max(1, Math.round(Number(process.argv[1]) * 60)))" "$TIMEOUT_MIN")
( sleep "$TIMEOUT_S"
  if kill -0 "$CPID" 2>/dev/null; then
    touch "$WORK/timed_out"
    pkill -TERM -P "$CPID" 2>/dev/null; kill -TERM "$CPID" 2>/dev/null
    sleep 10; pkill -KILL -P "$CPID" 2>/dev/null; kill -KILL "$CPID" 2>/dev/null
  fi ) &
WPID=$!
wait "$CPID" 2>/dev/null
kill "$WPID" 2>/dev/null; wait "$WPID" 2>/dev/null
END=$(now_ms)

"$ROOT/bench/post.sh" "$WORK" "$EXP" "$ARM" "$FIXTURE" "$REP" "$PLUGIN" "$MODEL" "$ARGS_JSON" "$((END - START))"
