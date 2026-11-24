#!/usr/bin/env bash
# Fail if a change touches anything the improver may not touch (see bench/improver-allow).
#   bench/guard.sh <base> <head>     head may be WORKTREE (uncommitted edits plus new files)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE=${1:?base}; HEAD=${2:?head}
{
  if [ "$HEAD" = WORKTREE ]; then
    git -C "$ROOT" diff --name-status --no-renames "$BASE"
    git -C "$ROOT" ls-files -o --exclude-standard | sed 's/^/A\t/'
  else
    git -C "$ROOT" diff --name-status --no-renames "$BASE" "$HEAD"
  fi
} | node "$ROOT/bench/lib/guard.mjs" "$ROOT/bench/improver-allow"
