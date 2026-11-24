#!/usr/bin/env bash
# Match a review draft against a checklist. Prints the claude JSON result.
#   bench/judge-review.sh <checklist.json> <draft.md>
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_BIN="${BENCH_CLAUDE:-claude}"
SCHEMA='{"type":"object","properties":{"matches":{"type":"array","items":{"type":"object","properties":{"item":{"type":"string"},"draft":{"type":["integer","null"]}},"required":["item","draft"]}},"draft_count":{"type":"integer"},"extras":{"type":"array","items":{"type":"object","properties":{"draft":{"type":"integer"},"plausible":{"type":"boolean"}},"required":["draft","plausible"]}}},"required":["matches","draft_count","extras"]}'
PROMPT="$(cat "$ROOT/bench/prompts/judge-review.md")

<checklist>
$(node -e 'for (const i of JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).items) console.log(`[${i.id}] ${i.check}${i.why ? " (why: " + i.why + ")" : ""}`)' "$1")
</checklist>

<draft>
$(head -c 60000 "$2" 2>/dev/null)
</draft>"
cd "$(mktemp -d)" && "$CLAUDE_BIN" -p "$PROMPT" --model "${JUDGE_MODEL:-claude-haiku-5-5}" --output-format json \
  --setting-sources project,local --json-schema "$SCHEMA" --max-budget-usd "${JUDGE_BUDGET:-0.5}"
