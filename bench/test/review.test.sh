#!/usr/bin/env bash
# run-review.sh + compare.sh end to end with a fake claude: recall scoring, no reference leakage, better/worse skills.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
R="$TMP/repo"; mkdir -p "$R/bench" "$R/skills/team-review" "$R/fx"
cp -R "$SRC/bench/lib" "$R/bench/lib"; cp -R "$SRC/bench/prompts" "$R/bench/prompts"
cp "$SRC/bench/compare.sh" "$SRC/bench/run-review.sh" "$SRC/bench/judge-review.sh" "$R/bench/"
for i in 1 2 3 4 5 6; do
  d="$R/fx/pr-$i"; mkdir -p "$d/input" "$d/reference"; echo "diff $i" > "$d/input/diff.patch"; echo "# PR $i" > "$d/input/pr.md"
  echo '{"skills":["team-review"]}' > "$d/meta.json"
  echo '{"items":[{"id":"k1","check":"first"},{"id":"k2","check":"second"},{"id":"k3","check":"third"},{"id":"k4","check":"fourth"}]}' > "$d/reference/checklist.json"
done
echo "level: 1" > "$R/skills/team-review/SKILL.md"
git -C "$R" init -q -b main && git -C "$R" add -A && git -C "$R" -c user.email=t@t -c user.name=t commit -qm base
export BENCH_CLAUDE="$SRC/bench/test/stubs/claude-review" BENCH_CACHE="$TMP/cache" BENCH_EXPORTS="$TMP/exports" BENCH_RESULTS="$TMP/results" BENCH_WORK="$TMP/work"
export STUB_CHECKLIST="$R/fx/pr-1/reference/checklist.json" STUB_LS_LOG="$TMP/ls.log"

# single run: recall = covered / total, and the agent's folder holds only input/
BENCH_PLUGIN_DIR="$R" BENCH_FIXTURES="$R/fx" "$R/bench/run-review.sh" --exp ER --arm one --fixture pr-1 --rep 1 --budget 1 > "$TMP/rowpath"
node -e '
const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const a = require("assert/strict");
a.equal(r.status, "ok"); a.equal(r.recall, 0.25); a.equal(r.matched, 1); a.equal(r.items, 4); a.equal(r.precision, 1);
console.log("ok review_row_scores_recall");' "$(cat "$TMP/rowpath")"
grep -qx input "$TMP/ls.log" && ! grep -q reference "$TMP/ls.log" && echo "ok agent_folder_has_no_reference"

# compare: level 1 -> level 3 skill is BETTER, level 3 -> level 1 is WORSE
commit() { echo "level: $1" > "$R/skills/team-review/SKILL.md"; git -C "$R" -c user.email=t@t -c user.name=t commit -qam "level $1"; }
cmp() { "$R/bench/compare.sh" "$@" --fixtures "$R/fx" --runner "$R/bench/run-review.sh" --min 5 --metric recall 2>/dev/null; }
commit 3
set +e; cmp HEAD~1 HEAD > "$TMP/o1"; rc=$?; set -e
[ "$rc" = 0 ] && grep -q "Verdict: BETTER" "$TMP/o1" || { echo "FAIL better rc=$rc"; cat "$TMP/o1"; exit 1; }
echo "ok compare_better_with_review_runner"
commit 1
set +e; cmp HEAD~1 HEAD > "$TMP/o2"; rc=$?; set -e
[ "$rc" = 1 ] && grep -q "Verdict: WORSE" "$TMP/o2" || { echo "FAIL worse rc=$rc"; cat "$TMP/o2"; exit 1; }
echo "ok compare_worse_with_review_runner"

# a run with no draft is dropped from the comparison, not scored as zero
echo "level: 0" > "$R/skills/team-review/SKILL.md"
BENCH_PLUGIN_DIR="$R" BENCH_FIXTURES="$R/fx" "$R/bench/run-review.sh" --exp ER --arm zero --fixture pr-1 --rep 1 --budget 1 > "$TMP/rowpath2"
[ "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).status)' "$(cat "$TMP/rowpath2")")" = no_draft ]
echo "ok missing_draft_is_not_scored_as_zero"
