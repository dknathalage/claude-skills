#!/usr/bin/env python3
"""Render a claude-skills plan.json as a superpowers-format plan.md (for the superpowers A/B arm).
Usage: plan-to-md.py <plan.json> <title> > plan.md"""
import json, sys
g = json.load(open(sys.argv[1])); title = sys.argv[2]
out = [f"# {title} Implementation Plan", "",
  "> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.", "",
  f"**Goal:** {g['goal']}", "", "**Spec:** " + g['spec'], "",
  "## Global Constraints", "", "- Names and signatures exactly as the spec's code-shape section.", "", "---", ""]
num = {t['id']: i for i, t in enumerate(g['tasks'], 1)}
for t in g['tasks']:
    out += [f"### Task {num[t['id']]}: {t['title']}", "", "**Files:**"] + [f"- Create or modify: `{f}`" for f in t['owns']] + [""]
    if t.get('depends_on'):
        out += ["**Depends on:** " + ", ".join(f"Task {num[d]}" for d in t['depends_on']), ""]
    for line in t['instructions'].split('\n'):
        n, rest = line.split('. ', 1)
        out.append(f"- [ ] **Step {n}:** {rest}")
    out += [f"- [ ] **Verify:** Run: `{t['verify']}` Expected: PASS",
            f"- [ ] **Commit:** `git add {' '.join(t['owns'])} && git commit -m \"{t['id']}: {t['title']}\"`", ""]
print('\n'.join(out))
