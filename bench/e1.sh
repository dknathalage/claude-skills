#!/usr/bin/env bash
# E1: does parallelism pay? F-medium, hand-written plan, 3 reps, arms interleaved.
set -uo pipefail
cd "$(dirname "$0")/.."
for rep in 1 2 3; do
  bench/run.sh --exp E1 --arm swarm  --fixture f-medium --rep $rep --budget 12 \
    --prompt bench/prompts/driver-claude-skills-planned.md --args-json '{"isolation":"worktree","check":true,"serial":false}'
  bench/run.sh --exp E1 --arm serial --fixture f-medium --rep $rep --budget 12 \
    --prompt bench/prompts/driver-claude-skills-planned.md --args-json '{"isolation":"worktree","check":true,"serial":true}'
  bench/run.sh --exp E1 --arm superpowers --fixture f-medium --rep $rep --budget 20 \
    --prompt bench/prompts/driver-superpowers-planned.md
  echo "rep $rep done, spend $(node bench/lib/summarize.mjs --spend)"
done
node bench/lib/summarize.mjs E1
