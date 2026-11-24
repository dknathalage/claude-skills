#!/usr/bin/env node
// Check the checklist judge against your own labels before trusting its scores.
//   node team/calibrate-judge.mjs <labels-dir> [--min-accuracy 0.85]
// Each label file is JSON: {"checklist":[{"id":"k1","check":"…"}], "draft":"1. a.go:10 …", "matched":["k1","k3"]}
// "matched" is what YOU say the draft covers. The judge runs on each draft; this prints how often it agrees with you.
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function agreement(items, truth, judged) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const id of items) {
    const t = truth.has(id), j = judged.has(id);
    if (t && j) tp++; else if (!t && j) fp++; else if (t && !j) fn++; else tn++;
  }
  return { tp, fp, fn, tn };
}

export function summarise(rows) {
  const s = rows.reduce((a, r) => ({ tp: a.tp + r.tp, fp: a.fp + r.fp, fn: a.fn + r.fn, tn: a.tn + r.tn }), { tp: 0, fp: 0, fn: 0, tn: 0 });
  const n = s.tp + s.fp + s.fn + s.tn;
  return { ...s, n, accuracy: n ? (s.tp + s.tn) / n : null, judge_precision: s.tp + s.fp ? s.tp / (s.tp + s.fp) : null, judge_recall: s.tp + s.fn ? s.tp / (s.tp + s.fn) : null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir] = process.argv.slice(2);
  const minAcc = Number(process.argv[process.argv.indexOf('--min-accuracy') + 1] || 0.85);
  if (!dir) { console.error('usage: calibrate-judge.mjs <labels-dir>'); process.exit(64); }
  const rows = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const label = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const tmp = mkdtempSync(join(tmpdir(), 'cal-'));
    writeFileSync(join(tmp, 'checklist.json'), JSON.stringify({ items: label.checklist }));
    writeFileSync(join(tmp, 'draft.md'), label.draft);
    const env = JSON.parse(execFileSync('bash', [join(ROOT, 'bench/judge-review.sh'), join(tmp, 'checklist.json'), join(tmp, 'draft.md')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    const out = env.structured_output || JSON.parse(env.result);
    const judged = new Set((out.matches || []).filter(m => Number.isInteger(m.draft)).map(m => m.item));
    rows.push(agreement(label.checklist.map(i => i.id), new Set(label.matched), judged));
  }
  const s = summarise(rows);
  console.log(JSON.stringify(s, null, 2));
  if (s.accuracy === null || s.accuracy < minAcc) { console.error(`Judge agrees with you on ${(100 * (s.accuracy ?? 0)).toFixed(0)}% of items, below ${(100 * minAcc).toFixed(0)}%. Do not trust its scores yet: tighten bench/prompts/judge-review.md or set JUDGE_MODEL to a stronger model.`); process.exit(1); }
}
