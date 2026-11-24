#!/usr/bin/env bash
# compare.sh end to end with a fake runner: no model calls, no cost.
#   better_change_exits_0 · worse_change_exits_1 · worktree_mode · cache_reused · unchanged_runs_nothing · guard_blocks_seed
set -euo pipefail
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# A throwaway repo that carries the real bench scripts, one team skill and 8 fixtures.
R="$TMP/repo"; mkdir -p "$R/bench" "$R/skills/team-review" "$R/skills/improver" "$R/fx"
cp -R "$SRC/bench/lib" "$R/bench/lib"; cp "$SRC/bench/compare.sh" "$SRC/bench/guard.sh" "$SRC/bench/improver-allow" "$R/bench/"
echo "level: 5" > "$R/skills/team-review/SKILL.md"; echo seed > "$R/skills/improver/SKILL.md"
for i in 1 2 3 4 5 6 7 8; do mkdir "$R/fx/pr-$i"; echo '{"skills":["team-review"]}' > "$R/fx/pr-$i/meta.json"; done
mkdir "$R/fx/pr-other"; echo '{"skills":["team-jira"]}' > "$R/fx/pr-other/meta.json"
git -C "$R" init -q -b main && git -C "$R" add -A && git -C "$R" -c user.email=t@t -c user.name=t commit -qm base

# Fake runner: recall = the number after "level:" in the skill / 10; counts invocations.
cat > "$TMP/runner.sh" <<'RUN'
#!/usr/bin/env bash
while [ $# -gt 0 ]; do case "$1" in --arm) ARM=$2;; --fixture) FX=$2;; --rep) REP=$2;; esac; shift; done
echo x >> "$RUNLOG"
LEVEL=$(sed -n 's/^level: //p' "$BENCH_PLUGIN_DIR/skills/team-review/SKILL.md")
mkdir -p "$BENCH_RESULTS/raw/compare"
echo "{\"status\":\"ok\",\"recall\":$(awk -v l="$LEVEL" 'BEGIN{print l/10}'),\"cost_usd\":0.1,\"judge_cost_usd\":0.02}" > "$BENCH_RESULTS/raw/compare/${ARM}__${FX}__${REP}.json"
RUN
chmod +x "$TMP/runner.sh"
export RUNLOG="$TMP/runlog" BENCH_CACHE="$TMP/cache" BENCH_EXPORTS="$TMP/exports" BENCH_RESULTS="$TMP/results"
cmp() { "$R/bench/compare.sh" "$@" --fixtures "$R/fx" --runner "$TMP/runner.sh" --min 5 2>/dev/null; }
commit() { echo "level: $1" > "$R/skills/team-review/SKILL.md"; git -C "$R" -c user.email=t@t -c user.name=t commit -qam "level $1"; }

# better_change_exits_0
: > "$RUNLOG"; commit 7
set +e; cmp HEAD~1 HEAD >"$TMP/out1"; rc=$?; set -e
[ "$rc" = 0 ] && grep -q "Verdict: BETTER" "$TMP/out1" || { echo "FAIL better: rc=$rc"; cat "$TMP/out1"; exit 1; }
grep -q "pr-other" "$TMP/out1" && { echo "FAIL unaffected fixture ran"; exit 1; }
echo "ok better_change_exits_0"

# worse_change_exits_1
commit 3
set +e; cmp HEAD~1 HEAD >"$TMP/out2"; rc=$?; set -e
[ "$rc" = 1 ] && grep -q "Verdict: WORSE" "$TMP/out2" || { echo "FAIL worse: rc=$rc"; cat "$TMP/out2"; exit 1; }
echo "ok worse_change_exits_1"

# cache_reused: HEAD~1 (level 7) was scored as 'head' in the first compare, so only the new head runs.
: > "$RUNLOG"; commit 8
set +e; cmp HEAD~1 HEAD >"$TMP/out3"; rc=$?; set -e
RUNS=$(wc -l < "$RUNLOG")
[ "$rc" = 0 ] && [ "$RUNS" -le 10 ] || { echo "FAIL cache: rc=$rc runs=$RUNS (base should be cached)"; exit 1; }
grep -q "from cache" "$TMP/out3"
echo "ok cache_reused ($RUNS runs)"

# worktree_mode: uncommitted edit compares against HEAD, same verdict logic
echo "level: 9" > "$R/skills/team-review/SKILL.md"
set +e; cmp HEAD WORKTREE >"$TMP/out4"; rc=$?; set -e
[ "$rc" = 0 ] && grep -q "WORKTREE" "$TMP/out4" || { echo "FAIL worktree: rc=$rc"; cat "$TMP/out4"; exit 1; }
git -C "$R" checkout -q -- skills
echo "ok worktree_mode"

# unchanged_runs_nothing: same skill content → no runs, exit 0
: > "$RUNLOG"; git -C "$R" -c user.email=t@t -c user.name=t commit -q --allow-empty -m empty
cmp HEAD~1 HEAD >"$TMP/out5"
[ ! -s "$RUNLOG" ] && grep -q "Nothing to run" "$TMP/out5"
echo "ok unchanged_runs_nothing"

# guard_blocks_seed: editing the improver skill or the bench fails; editing a team skill passes
echo "tampered" > "$R/skills/improver/SKILL.md"
if "$R/bench/guard.sh" HEAD WORKTREE >/dev/null 2>&1; then echo "FAIL guard let seed edit through"; exit 1; fi
git -C "$R" checkout -q -- skills
echo "level: 4" > "$R/skills/team-review/SKILL.md"
"$R/bench/guard.sh" HEAD WORKTREE >/dev/null
git -C "$R" checkout -q -- skills
echo "ok guard_blocks_seed"
