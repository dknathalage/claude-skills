#!/usr/bin/env bash
# Dump skills from ~/.claude/skills (or a given dir) into this plugin
# and bump its patch version so `/plugin marketplace update` picks up the change.
#
#   scripts/dump.sh                 # copy every skill in ~/.claude/skills
#   scripts/dump.sh path/to/skill   # copy one skill directory
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/skills"
MANIFEST="$ROOT/.claude-plugin/plugin.json"

if [ $# -gt 0 ]; then
  SOURCES=("$@")
else
  SOURCES=()
  for d in "$HOME/.claude/skills"/*/; do
    [ -f "$d/SKILL.md" ] && SOURCES+=("${d%/}")
  done
fi

[ ${#SOURCES[@]} -eq 0 ] && { echo "No skills found to dump."; exit 0; }

for src in "${SOURCES[@]}"; do
  [ -f "$src/SKILL.md" ] || { echo "skip: $src (no SKILL.md)"; continue; }
  name="$(basename "$src")"
  rsync -a --delete --exclude '.DS_Store' "$src/" "$DEST/$name/"
  echo "dumped: $name"
done

if git -C "$ROOT" diff --quiet -- "$DEST" && [ -z "$(git -C "$ROOT" ls-files --others --exclude-standard -- "$DEST")" ]; then
  echo "No changes."
  exit 0
fi

current="$(sed -nE 's/.*"version": *"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/p' "$MANIFEST" | head -1)"
IFS=. read -r major minor patch <<<"$current"
next="$major.$minor.$((patch + 1))"
sed -i '' -E "s/\"version\": *\"$current\"/\"version\": \"$next\"/" "$MANIFEST"
echo "version: $current -> $next"
echo "Now commit and push, then run /plugin marketplace update claude-skills"
