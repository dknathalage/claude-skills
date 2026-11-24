#!/usr/bin/env bash
# Compare two states of the skills on the same fixtures. Local only, no CI.
#
#   bench/compare.sh <base> <head> --fixtures DIR [options]
#
# <base>, <head>   a git ref (HEAD, HEAD~1, a sha) or WORKTREE (the working tree, uncommitted edits included).
# --fixtures DIR   fixture folders to run; repeatable. Each fixture may carry meta.json: {"regression":true,"skills":["team-review"]}.
#                  bench/regress/ is added automatically when it holds fixtures (the improver's regression cases).
# --metric M       auto (recall, else hidden pass rate) | recall | hidden_pass_rate | review_score
# --tol 0.02       a drop smaller than this counts as noise
# --min 5 --max 30 fewest pairs before a decision, most pairs to run
# --reps 1         runs per fixture per side (more fixtures beat more reps)
# --budget-run 2   per-session cap in USD, passed to the runner
# --budget-total 10 stop starting new runs once this much new spend is reached (verdict then INCONCLUSIVE if undecided)
# --cost-ratio 1.25 head cost per run above this multiple of base is COST_UP
# --runner CMD     default bench/run.sh; must accept run.sh's flags and write $BENCH_RESULTS/raw/<exp>/<arm>__<fixture>__<rep>.json
# --runner-args S  extra flags for the runner, e.g. "--prompt bench/prompts/driver-review.md"
# --seed N         fixture order seed; --force ignores the score cache
#
# Scores cache by the content hash of the skills (bench/lib/skillhash.mjs) under $BENCH_CACHE
# (default ~/.cache/claude-skills-bench/scores), so the current version is scored once and reused.
# Only fixtures the changed skills can affect run. Exit: 0 BETTER/NO_WORSE, 1 WORSE, 2 INCONCLUSIVE, 3 COST_UP.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="${BENCH_CACHE:-$HOME/.cache/claude-skills-bench/scores}"
EXPORTS="${BENCH_EXPORTS:-$HOME/.cache/claude-skills-bench/exports}"
RESULTS="${BENCH_RESULTS:-$ROOT/bench/results}"

[ $# -ge 2 ] || { sed -n '2,24p' "$0" >&2; exit 64; }
BASE_REF=$1 HEAD_REF=$2; shift 2
FIXTURE_DIRS=() METRIC=auto TOL=0.02 MIN=5 MAX=30 REPS=1 BUDGET_RUN=2 BUDGET_TOTAL=10 COST_RATIO=1.25
RUNNER="$ROOT/bench/run.sh" RUNNER_ARGS= SEED=1 FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --fixtures) FIXTURE_DIRS+=("$2"); shift 2 ;;
    --metric) METRIC=$2; shift 2 ;;
    --tol) TOL=$2; shift 2 ;;
    --min) MIN=$2; shift 2 ;;
    --max) MAX=$2; shift 2 ;;
    --reps) REPS=$2; shift 2 ;;
    --budget-run) BUDGET_RUN=$2; shift 2 ;;
    --budget-total) BUDGET_TOTAL=$2; shift 2 ;;
    --cost-ratio) COST_RATIO=$2; shift 2 ;;
    --runner) RUNNER=$2; shift 2 ;;
    --runner-args) RUNNER_ARGS=$2; shift 2 ;;
    --seed) SEED=$2; shift 2 ;;
    --force) FORCE=1; shift ;;
    *) echo "unknown arg $1" >&2; exit 64 ;;
  esac
done
[ ${#FIXTURE_DIRS[@]} -gt 0 ] || { echo "--fixtures DIR is required" >&2; exit 64; }
ABS=()
for d in "${FIXTURE_DIRS[@]}"; do [ -d "$d" ] || { echo "no such fixtures dir: $d" >&2; exit 64; }; ABS+=("$(cd "$d" && pwd)"); done
if [ -d "$ROOT/bench/regress" ] && [ -n "$(find "$ROOT/bench/regress" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)" ]; then ABS+=("$ROOT/bench/regress"); fi
SEL=(); for d in "${ABS[@]}"; do SEL+=(--fixtures "$d"); done
mkdir -p "$CACHE" "$EXPORTS"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# export <ref> → prints the export dir (named by content hash, so it is built once and never changes).
export_side() {
  local ref=$1 stage="$TMP/stage-$2" hash
  mkdir -p "$stage"
  if [ "$ref" = WORKTREE ]; then
    ( cd "$ROOT" && git ls-files -z -co --exclude-standard \
        | while IFS= read -r -d '' f; do [ -e "$f" ] && printf '%s\0' "$f"; done \
        | tar --null -T - -cf - ) | tar -xf - -C "$stage"
  else
    git -C "$ROOT" rev-parse --verify -q "$ref^{commit}" >/dev/null || { echo "not a commit: $ref" >&2; return 1; }
    git -C "$ROOT" archive "$ref" | tar -xf - -C "$stage"
  fi
  node "$ROOT/bench/lib/skillhash.mjs" "$stage" > "$TMP/hash-$2.json"
  hash=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).plugin)' "$TMP/hash-$2.json")
  [ -d "$EXPORTS/$hash" ] || mv "$stage" "$EXPORTS/$hash"
  echo "$hash"
}

BASE_HASH=$(export_side "$BASE_REF" base) || exit 64
HEAD_HASH=$(export_side "$HEAD_REF" head) || exit 64
B8=${BASE_HASH:0:8} H8=${HEAD_HASH:0:8}

node "$ROOT/bench/lib/compare.mjs" select "${SEL[@]}" --base "$TMP/hash-base.json" --head "$TMP/hash-head.json" --seed "$SEED" > "$TMP/order.tsv" 2> "$TMP/select.err"
cat "$TMP/select.err" >&2
if [ ! -s "$TMP/order.tsv" ]; then
  echo "No skill content changed between $BASE_REF ($B8) and $HEAD_REF ($H8), or no fixture can be affected. Nothing to run."
  exit 0
fi

# run_side <label> <hash> <fixture> <rep> → prints the row path (cached or fresh); adds new spend to $TMP/spend
run_side() {
  local label=$1 hash=$2 fixture=$3 rep=$4 fdir=$5
  local cached="$CACHE/$hash/${fixture}__${rep}.json"
  if [ "$FORCE" = 0 ] && [ -f "$cached" ]; then echo "$cached"; return; fi
  local out="$TMP/run-$label-$fixture-$rep"
  mkdir -p "$out"
  # shellcheck disable=SC2086
  BENCH_PLUGIN_DIR="$EXPORTS/$hash" BENCH_RESULTS="$out" BENCH_FIXTURES="$fdir" \
    "$RUNNER" --exp compare --arm "$label-${hash:0:8}" --fixture "$fixture" --rep "$rep" --budget "$BUDGET_RUN" $RUNNER_ARGS >/dev/null 2>&1
  local row="$out/raw/compare/$label-${hash:0:8}__${fixture}__${rep}.json"
  if [ -f "$row" ]; then
    local c; c=$(node "$ROOT/bench/lib/compare.mjs" cost "$row")
    echo "$(cat "$TMP/spend") $c" | awk '{printf "%.6f", $1+$2}' > "$TMP/spend.new" && mv "$TMP/spend.new" "$TMP/spend"
    if [ "$(node "$ROOT/bench/lib/compare.mjs" status "$row")" = ok ]; then
      mkdir -p "$CACHE/$hash"; cp "$row" "$cached"
    fi
    echo "$row"
  else
    echo "$out/missing.json"
  fi
}

echo 0 > "$TMP/spend"
: > "$TMP/pairs.jsonl"
CACHED=0 N=0 DECISION='{}'
while IFS=$'\t' read -r fixture regression fdir; do
  for rep in $(seq 1 "$REPS"); do
    if [ "$(awk -v s="$(cat "$TMP/spend")" -v b="$BUDGET_TOTAL" 'BEGIN{print (s>=b)?1:0}')" = 1 ]; then
      echo "Budget reached (\$$BUDGET_TOTAL). Stopping." >&2; break 2
    fi
    [ -f "$CACHE/$BASE_HASH/${fixture}__${rep}.json" ] && [ "$FORCE" = 0 ] && CACHED=$((CACHED + 1))
    base_row=$(run_side base "$BASE_HASH" "$fixture" "$rep" "$fdir")
    head_row=$(run_side head "$HEAD_HASH" "$fixture" "$rep" "$fdir")
    node "$ROOT/bench/lib/compare.mjs" pair --fixture "$fixture" --regression "$regression" \
      --base-row "$base_row" --head-row "$head_row" --metric "$METRIC" >> "$TMP/pairs.jsonl"
    N=$((N + 1))
    echo "  $fixture rep $rep done ($N pairs, spent \$$(cat "$TMP/spend"))" >&2
  done
  DECISION=$(node "$ROOT/bench/lib/compare.mjs" decide "$TMP/pairs.jsonl" --tol "$TOL" --min "$MIN" --cost-ratio "$COST_RATIO")
  # Regression fixtures always run first and in full; stop early only after they are done.
  PENDING_REG=$(awk -F'\t' -v done_n="$N" '$2==1{c++} END{print (c>done_n/'"$REPS"')?1:0}' "$TMP/order.tsv")
  STOP=$(node -e 'console.log(JSON.parse(process.argv[1]).stop)' "$DECISION")
  if [ "$STOP" = true ] && [ "$PENDING_REG" = 0 ]; then break; fi
  [ "$N" -ge "$MAX" ] && break
done < "$TMP/order.tsv"

mkdir -p "$RESULTS/compare"
REPORT="$RESULTS/compare/$B8..$H8.md"
node "$ROOT/bench/lib/compare.mjs" report "$TMP/pairs.jsonl" --base "$BASE_REF ($B8)" --head "$HEAD_REF ($H8)" \
  --tol "$TOL" --min "$MIN" --cost-ratio "$COST_RATIO" --spent "$(cat "$TMP/spend")" --cached "$CACHED" > "$REPORT"
cp "$TMP/pairs.jsonl" "$RESULTS/compare/$B8..$H8.pairs.jsonl"
cat "$REPORT"
echo "Report: $REPORT" >&2
VERDICT=$(node "$ROOT/bench/lib/compare.mjs" decide "$TMP/pairs.jsonl" --tol "$TOL" --min "$MIN" --cost-ratio "$COST_RATIO" --final | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).verdict))')
case "$VERDICT" in BETTER|NO_WORSE) exit 0 ;; WORSE) exit 1 ;; COST_UP) exit 3 ;; *) exit 2 ;; esac
