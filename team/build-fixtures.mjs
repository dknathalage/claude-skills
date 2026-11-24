#!/usr/bin/env node
// Build bench fixtures from mined PRs, split into train (what skills may learn from) and holdout (what they are scored on).
//   node team/build-fixtures.mjs [--mined DIR] [--out DIR] [--holdout-frac 0.2] [--holdout-repo owner/name] [--max-diff-kb 300] [--skills team-review]
// Split is by time: the newest PRs are holdout. --holdout-repo also puts every PR of a repo in holdout.
// Layout: <out>/{train,holdout}/<owner>__<repo>__<n>/{meta.json, input/{pr.md,diff.patch}, reference/{checklist.json,comments.json}}
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from './mine.mjs';
import { prMarkdown } from './fetch-pr.mjs';
import { substantive } from './lib/filters.mjs';
import { roundOne } from './lib/pr-shape.mjs';
import { extractChecklist } from './checklist.mjs';

export function splitByTime(prs, { frac = 0.2, holdoutRepo } = {}) {
  const sorted = [...prs].sort((a, b) => a.merged_at.localeCompare(b.merged_at));
  const byRepo = sorted.filter(p => holdoutRepo && p.repo === holdoutRepo);
  const rest = sorted.filter(p => !(holdoutRepo && p.repo === holdoutRepo));
  const k = rest.length >= 5 ? Math.max(1, Math.round(rest.length * frac)) : 0;
  const holdout = [...rest.slice(rest.length - k), ...byRepo];
  return { train: rest.slice(0, rest.length - k), holdout };
}

export const fixtureId = pr => `${pr.repo.replace('/', '__')}__${pr.number}`;

function loadMined(root) {
  const out = [];
  for (const r of readdirSync(root)) {
    const rd = join(root, r);
    if (!statSync(rd).isDirectory()) continue;
    for (const n of readdirSync(rd)) {
      const d = join(rd, n);
      try { out.push({ dir: d, ...JSON.parse(readFileSync(join(d, 'pr.json'), 'utf8')), comments: JSON.parse(readFileSync(join(d, 'comments.json'), 'utf8')) }); } catch { /* not a mined PR */ }
    }
  }
  return out;
}

export async function buildFixtures({ mined, out, frac, holdoutRepo, maxDiffKb = 300, skills = ['team-review'], log = () => {} }) {
  const eligible = [];
  const skipped = [];
  let spent = 0;
  for (const pr of loadMined(mined)) {
    const diffKb = statSync(join(pr.dir, 'diff.patch')).size / 1024;
    if (diffKb > maxDiffKb) { skipped.push([fixtureId(pr), `diff ${Math.round(diffKb)} KB`]); continue; }
    const round = substantive(roundOne(pr.comments, pr.review_commit));
    if (!round.length) { skipped.push([fixtureId(pr), 'no substantive round-one comments']); continue; }
    const res = await extractChecklist(pr, round, { cacheDir: join(out, '.checklist-cache') });
    spent += res.cost_usd;
    if (!res.items.length) { skipped.push([fixtureId(pr), 'no checkable findings']); continue; }
    eligible.push({ pr, round, items: res.items });
    log(`  ${fixtureId(pr)}: ${res.items.length} checks${res.cached ? ' (cached)' : ''}`);
  }
  const { train, holdout } = splitByTime(eligible.map(e => ({ ...e.pr, _e: e })), { frac, holdoutRepo });
  for (const split of ['train', 'holdout']) rmSync(join(out, split), { recursive: true, force: true });
  const write = (split, list) => list.forEach(({ _e: e }) => {
    const d = join(out, split, fixtureId(e.pr));
    mkdirSync(join(d, 'input'), { recursive: true }); mkdirSync(join(d, 'reference'), { recursive: true });
    writeFileSync(join(d, 'input/pr.md'), prMarkdown(e.pr));
    writeFileSync(join(d, 'input/diff.patch'), readFileSync(join(e.pr.dir, 'diff.patch')));
    writeFileSync(join(d, 'reference/checklist.json'), JSON.stringify({ items: e.items }, null, 2));
    writeFileSync(join(d, 'reference/comments.json'), JSON.stringify(e.pr.comments.filter(c => c.kind !== 'issue' || split === 'train'), null, 2));
    writeFileSync(join(d, 'meta.json'), JSON.stringify({ id: fixtureId(e.pr), repo: e.pr.repo, number: e.pr.number, merged_at: e.pr.merged_at, skills, items: e.items.length, regression: false }, null, 2));
  });
  write('train', train); write('holdout', holdout);
  writeFileSync(join(out, 'split.json'), JSON.stringify({ train: train.map(fixtureId), holdout: holdout.map(fixtureId), skipped, checklist_cost_usd: spent }, null, 2));
  return { train: train.length, holdout: holdout.length, skipped, spent };
}

const arg = (a, k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const root = dataDir();
  const r = await buildFixtures({
    mined: arg(a, '--mined', join(root, 'mined')), out: arg(a, '--out', join(root, 'fixtures')),
    frac: Number(arg(a, '--holdout-frac', 0.2)), holdoutRepo: arg(a, '--holdout-repo'), maxDiffKb: Number(arg(a, '--max-diff-kb', 300)),
    skills: arg(a, '--skills', 'team-review').split(','), log: m => console.error(m),
  });
  console.log(`train ${r.train}, holdout ${r.holdout}, skipped ${r.skipped.length}, checklist spend $${r.spent.toFixed(2)}`);
}
