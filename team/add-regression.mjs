#!/usr/bin/env node
// Turn a draft the person corrected into a regression fixture, so a later change cannot quietly lose that lesson.
//   node team/add-regression.mjs --draft ID --check "what a reviewer should flag" [--check …] [--skills team-review] [--out bench/regress]
// Needs the draft to have been logged with --input. Add-only: refuses to touch an existing fixture.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from './mine.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const all = (a, k) => a.flatMap((x, i) => (x === k ? [a[i + 1]] : []));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const draft = all(a, '--draft')[0], checks = all(a, '--check');
  const out = all(a, '--out')[0] || join(ROOT, 'bench/regress');
  const fail = m => { console.error(m); process.exit(64); };
  if (!draft || !checks.length) fail('usage: add-regression.mjs --draft ID --check "…" [--check …] [--skills team-review] [--out DIR]');
  const snap = join(dataDir(), 'relay-inputs', draft);
  if (!existsSync(join(snap, 'diff.patch'))) fail(`no input snapshot for ${draft}: log drafts with relay.mjs draft --input DIR`);
  const dir = join(out, `reg-${draft}`);
  if (existsSync(dir)) fail(`${dir} already exists; regression cases are add-only`);
  mkdirSync(join(dir, 'input'), { recursive: true }); mkdirSync(join(dir, 'reference'), { recursive: true });
  cpSync(snap, join(dir, 'input'), { recursive: true });
  writeFileSync(join(dir, 'reference/checklist.json'), JSON.stringify({ items: checks.map((c, i) => ({ id: `k${i + 1}`, check: c, source: [] })) }, null, 2));
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ id: `reg-${draft}`, skills: (all(a, '--skills')[0] || 'team-review').split(','), regression: true, items: checks.length, from_draft: draft }, null, 2));
  console.log(`added ${dir}`);
}
