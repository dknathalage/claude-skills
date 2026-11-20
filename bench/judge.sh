#!/usr/bin/env bash
# Blind review of one run's diff against the spec. Prints the claude JSON result
# (structured_output = {score, reasons}). Usage: judge.sh <SPEC.md> <diff.patch>
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_BIN="${BENCH_CLAUDE:-$(ls -d "$HOME/Library/Application Support/Claude/claude-code"/*/*/claude.app/Contents/MacOS/claude 2>/dev/null | sort -V | tail -1)}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
SPEC="$1" DIFF="$2"
SCHEMA='{"type":"object","properties":{"score":{"type":"integer","minimum":1,"maximum":10},"reasons":{"type":"array","items":{"type":"string"}}},"required":["score","reasons"]}'
PROMPT="$(cat "$ROOT/bench/prompts/judge.md")

<spec>
$(cat "$SPEC" 2>/dev/null)
</spec>

<diff>
$(head -c 200000 "$DIFF" 2>/dev/null)
</diff>"
cd "$(mktemp -d)" && "$CLAUDE_BIN" -p "$PROMPT" \
  --model "${JUDGE_MODEL:-claude-opus-5-5}" \
  --output-format json \
  --setting-sources project,local \
  --json-schema "$SCHEMA" \
  --max-budget-usd "${JUDGE_BUDGET:-2}"
