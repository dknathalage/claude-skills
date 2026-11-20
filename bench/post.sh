#!/usr/bin/env bash
# Score a finished bench session: hidden tests, blind judge, result row.
#   bench/post.sh <work-dir> <exp> <arm> <fixture> <rep> <plugin> <model> <args-json> [wall_ms]
# wall_ms defaults to the session's own duration_ms from its transcript.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURES="${BENCH_FIXTURES:-$ROOT/bench/fixtures}"
RESULTS="${BENCH_RESULTS:-$ROOT/bench/results}"
WORK="$(cd "$1" && pwd)" EXP=$2 ARM=$3 FIXTURE=$4 REP=$5 PLUGIN=$6 MODEL=$7 ARGS_JSON=$8 WALL=${9:-}
FIX="$FIXTURES/$FIXTURE"
REPO="$WORK/repo"
NAME="${ARM}__${FIXTURE}__${REP}"
mkdir -p "$RESULTS/raw/$EXP"

BASE_SHA="$(git -C "$REPO" rev-list --max-parents=0 HEAD | tail -1)"
if [ -z "$WALL" ]; then
  WALL=$(node -e '
    const l = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").reverse()
      .map(x => { try { return JSON.parse(x) } catch { return {} } }).find(e => e.type === "result");
    console.log(l?.duration_ms ?? 0)' "$WORK/transcript.jsonl")
fi

# Hidden tests, run on whatever the session left behind (current checkout).
if [ -d "$FIX/hidden-tests" ]; then
  rm -rf "$REPO/hidden-tests" && cp -R "$FIX/hidden-tests" "$REPO/hidden-tests"
  ( cd "$REPO" && dotnet test hidden-tests > "$WORK/hidden.log" 2>&1 )
fi

# Blind review: the judge sees the spec and the diff, never the arm.
git -C "$REPO" diff "$BASE_SHA" -- . ':(exclude)hidden-tests' > "$WORK/diff.patch" 2>/dev/null
git -C "$REPO" ls-files --others --exclude-standard -- . ':(exclude)hidden-tests' | while read -r f; do
  git -C "$REPO" diff --no-index /dev/null "$f" >> "$WORK/diff.patch" 2>/dev/null
done
if [ -n "${REJUDGE:-}" ] || ! node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).structured_output.score' "$WORK/judge.json" 2>/dev/null; then
  "$ROOT/bench/judge.sh" "$REPO/SPEC.md" "$WORK/diff.patch" > "$WORK/judge.json" 2>> "$WORK/stderr.log"
fi

BASE_ROW=$(node -e 'console.log(JSON.stringify({exp:process.argv[1],arm:process.argv[2],fixture:process.argv[3],rep:Number(process.argv[4]),wall_ms:Number(process.argv[5]),plugin:process.argv[6],session_model:process.argv[7],args:JSON.parse(process.argv[8])}))' \
  "$EXP" "$ARM" "$FIXTURE" "$REP" "$WALL" "$PLUGIN" "$MODEL" "$ARGS_JSON")
node "$ROOT/bench/lib/parse-run.mjs" "$WORK/transcript.jsonl" "$WORK/hidden.log" "$WORK/judge.json" "$FIX/meta.json" "$BASE_ROW" \
  > "$RESULTS/raw/$EXP/$NAME.json"
echo "$RESULTS/raw/$EXP/$NAME.json"
