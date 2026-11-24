#!/usr/bin/env node
// Fail if generated skills quote held-out material. Baseline skills may learn from train PRs only.
//   node team/leak-check.mjs <skills-dir-or-file …> --holdout <fixtures/holdout dir> [--words 8]
// Looks for any run of N words (default 8) from a holdout reviewer comment, checklist item or diff line in the skill text.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const norm = t => (t.toLowerCase().match(/[a-z0-9_]+/g) || []);
const walk = p => (statSync(p).isDirectory() ? readdirSync(p).flatMap(f => walk(join(p, f))) : [p]);

export function shingles(text, n) {
  const w = norm(text), out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

export function findLeaks(skillText, holdoutTexts, n = 8) {
  const mine = shingles(skillText, n);
  const hits = [];
  for (const { source, text } of holdoutTexts) for (const s of shingles(text, n)) if (mine.has(s)) hits.push({ source, run: s });
  return hits;
}

export function holdoutTexts(dir) {
  const out = [];
  for (const id of readdirSync(dir)) {
    const d = join(dir, id);
    if (!statSync(d).isDirectory()) continue;
    const add = (rel, f) => { const p = join(d, rel); if (existsSync(p)) out.push({ source: `${id}/${rel}`, text: f(readFileSync(p, 'utf8')) }); };
    add('reference/comments.json', t => JSON.parse(t).map(c => c.body).join('\n'));
    add('reference/checklist.json', t => JSON.parse(t).items.map(i => `${i.check} ${i.why || ''}`).join('\n'));
    add('input/diff.patch', t => t.split('\n').filter(l => /^[+-][^+-]/.test(l)).map(l => l.slice(1)).join('\n'));
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const hi = a.indexOf('--holdout'), wi = a.indexOf('--words');
  const holdout = hi >= 0 ? a[hi + 1] : null;
  const n = wi >= 0 ? Number(a[wi + 1]) : 8;
  const paths = a.filter((x, i) => !x.startsWith('--') && i !== hi + 1 && i !== wi + 1);
  if (!holdout || !paths.length) { console.error('usage: leak-check.mjs <skills …> --holdout DIR [--words 8]'); process.exit(64); }
  const text = paths.flatMap(walk).filter(f => /\.(md|mjs|js|sh|json|txt)$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
  const hits = findLeaks(text, holdoutTexts(holdout), n);
  if (hits.length) {
    console.error(`Generated skills quote held-out material (${hits.length} run(s)):`);
    for (const h of hits.slice(0, 10)) console.error(`  ${h.source}: "${h.run}"`);
    process.exit(1);
  }
  console.log('ok: no held-out text found in the generated skills');
}
