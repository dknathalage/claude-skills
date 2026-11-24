#!/usr/bin/env node
// Paired comparison of two skill versions on the same fixtures.
//   node bench/lib/compare.mjs select --fixtures DIR [--fixtures DIR2 …] --base H.json --head H.json [--seed N]
//        → prints "<fixture>\t<0|1 regression>\t<its fixtures dir>" lines, regression cases first, then a seeded shuffle,
//          limited to fixtures the changed skills can affect. Prints nothing if no skill changed.
//   node bench/lib/compare.mjs pair --fixture F --regression 0|1 --base-row R.json --head-row R.json [--metric auto]
//        → prints one pairs.jsonl line (a run that is missing or not status "ok" gives metric null)
//   node bench/lib/compare.mjs cost ROW.json | status ROW.json
//   node bench/lib/compare.mjs decide PAIRS.jsonl [--tol 0.02] [--min 5] [--cost-ratio 1.25] [--final]
//        → prints a verdict JSON: {verdict, stop, n, mean, lo, hi, ...}
//   node bench/lib/compare.mjs report PAIRS.jsonl --base <label> --head <label> [--tol ..] [--min ..] [--spent N]
//        → prints a markdown report
// PAIRS.jsonl: one {"fixture","regression","base":{"metric","cost"},"head":{"metric","cost"}} per line.
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- metric -------------------------------------------------------------
// recall (0..1) if the row has it, else hidden-test pass rate, else null.
export function metricOf(row, metric = 'auto') {
  if (!row) return null;
  const pick = {
    recall: r => (typeof r.recall === 'number' ? r.recall : null),
    hidden_pass_rate: r => {
      const h = r.hidden || {};
      const t = (h.passed || 0) + (h.failed || 0);
      return t ? h.passed / t : null;
    },
    review_score: r => (typeof r.review_score === 'number' ? r.review_score / 10 : null),
  };
  if (metric !== 'auto') return pick[metric] ? pick[metric](row) : null;
  return pick.recall(row) ?? pick.hidden_pass_rate(row);
}

export const costOf = row => (row ? (row.cost_usd || 0) + (row.judge_cost_usd || 0) : 0);

// ---- selection ----------------------------------------------------------
const mulberry32 = a => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function changedSkills(base, head) {
  const names = new Set([...Object.keys(base.skills), ...Object.keys(head.skills)]);
  const changed = [...names].filter(n => base.skills[n] !== head.skills[n]);
  if (base.plugin !== head.plugin && !changed.length) changed.push('*hooks*');
  return changed.sort();
}

export function selectFixtures(fixturesDirs, changed, seed = 1) {
  if (!changed.length) return [];
  const picked = [];
  for (const dir of [].concat(fixturesDirs)) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter(n => statSync(join(dir, n)).isDirectory()).sort()) {
      const mp = join(dir, name, 'meta.json');
      const meta = existsSync(mp) ? JSON.parse(readFileSync(mp, 'utf8')) : {};
      const affected = !Array.isArray(meta.skills) || meta.skills.some(s => changed.includes(s)) || changed.includes('*hooks*');
      if (affected) picked.push({ name, dir, regression: !!meta.regression });
    }
  }
  const rnd = mulberry32(seed);
  const rest = picked.filter(p => !p.regression);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...picked.filter(p => p.regression), ...rest];
}

// ---- statistics ---------------------------------------------------------
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

// Paired bootstrap 90% interval of the mean difference. Seeded, so the same pairs give the same answer.
export function bootstrapCI(diffs, iters = 2000, seed = 7) {
  const rnd = mulberry32(seed);
  const means = [];
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let k = 0; k < diffs.length; k++) s += diffs[Math.floor(rnd() * diffs.length)];
    means.push(s / diffs.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.05 * iters)], means[Math.min(iters - 1, Math.floor(0.95 * iters))]];
}

// Verdicts: BETTER (interval above zero), NO_WORSE (not below -tol, not proven better), WORSE,
// COST_UP (not worse but costs too much more), INCONCLUSIVE (too few pairs or interval straddles -tol).
export function decide(pairs, { tol = 0.02, min = 5, costRatio = 1.25, final = false } = {}) {
  const usable = pairs.filter(p => p.base.metric !== null && p.head.metric !== null);
  const regressions = usable.filter(p => p.regression && p.head.metric < p.base.metric - 1e-9);
  const diffs = usable.map(p => p.head.metric - p.base.metric);
  const out = { n: usable.length, dropped: pairs.length - usable.length, regression_failures: regressions.map(p => p.fixture) };
  if (regressions.length) return { ...out, verdict: 'WORSE', stop: true, reason: 'a regression case scored lower' };
  if (!diffs.length) return { ...out, verdict: 'INCONCLUSIVE', stop: final, reason: 'no usable pairs' };
  const m = mean(diffs);
  const [lo, hi] = bootstrapCI(diffs);
  const baseCost = mean(usable.map(p => p.base.cost));
  const headCost = mean(usable.map(p => p.head.cost));
  Object.assign(out, { mean: m, lo, hi, base_cost: baseCost, head_cost: headCost });
  if (usable.length < min) return { ...out, verdict: 'INCONCLUSIVE', stop: final, reason: `only ${usable.length} usable pairs, need ${min}` };
  let verdict, stop, reason;
  if (hi < 0 || m < -tol) { verdict = 'WORSE'; stop = true; reason = 'mean dropped'; }
  else if (lo > 0) { verdict = 'BETTER'; stop = true; reason = 'interval above zero'; }
  else if (lo >= -tol) { verdict = 'NO_WORSE'; stop = (hi - lo) / 2 < tol; reason = 'not worse, not proven better'; }
  else { verdict = 'INCONCLUSIVE'; stop = false; reason = 'interval straddles the tolerance'; }
  if ((verdict === 'BETTER' || verdict === 'NO_WORSE') && baseCost > 0 && headCost > baseCost * costRatio) {
    verdict = 'COST_UP'; stop = true; reason = `cost per run up ${(headCost / baseCost).toFixed(2)}x`;
  }
  if (final) stop = true;
  return { ...out, verdict, stop, reason };
}

export const exitCodeFor = v => ({ BETTER: 0, NO_WORSE: 0, WORSE: 1, INCONCLUSIVE: 2, COST_UP: 3 }[v] ?? 2);

export function report(pairs, d, { base, head, spent = 0, cachedPairs = 0 }) {
  const f = (v, k = 3) => (v === null || v === undefined ? '—' : Number(v).toFixed(k));
  const rows = pairs.map(p => `| ${p.fixture}${p.regression ? ' (regression)' : ''} | ${f(p.base.metric)} | ${f(p.head.metric)} | ${p.base.metric === null || p.head.metric === null ? '—' : f(p.head.metric - p.base.metric)} |`);
  return [
    `# Compare ${base} → ${head}`,
    '',
    `**Verdict: ${d.verdict}** — ${d.reason}.`,
    '',
    `- pairs used: ${d.n}${d.dropped ? ` (${d.dropped} dropped: a run failed)` : ''}`,
    `- mean difference (head − base): ${f(d.mean)}, 90% interval [${f(d.lo)}, ${f(d.hi)}]`,
    `- cost per run: base $${f(d.base_cost, 2)}, head $${f(d.head_cost, 2)}`,
    `- new spend this comparison: $${f(spent, 2)} (${cachedPairs} base scores came from cache)`,
    d.regression_failures?.length ? `- regression cases that dropped: ${d.regression_failures.join(', ')}` : '',
    '',
    '| fixture | base | head | diff |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].filter(l => l !== undefined).join('\n');
}

// ---- CLI ----------------------------------------------------------------
const arg = (a, k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const readPairs = p => readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === 'select') {
    const base = JSON.parse(readFileSync(arg(a, '--base'), 'utf8'));
    const head = JSON.parse(readFileSync(arg(a, '--head'), 'utf8'));
    const changed = changedSkills(base, head);
    if (!changed.length) process.exit(0);
    process.stderr.write(`changed: ${changed.join(', ')}\n`);
    const dirs = a.flatMap((x, i) => (x === '--fixtures' ? [a[i + 1]] : []));
    for (const p of selectFixtures(dirs, changed, Number(arg(a, '--seed', 1)))) {
      console.log(`${p.name}\t${p.regression ? 1 : 0}\t${p.dir}`);
    }
  } else if (cmd === 'pair') {
    const load = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
    const metric = arg(a, '--metric', 'auto');
    const b = load(arg(a, '--base-row')), h = load(arg(a, '--head-row'));
    const ok = r => r && r.status === 'ok';
    console.log(JSON.stringify({
      fixture: arg(a, '--fixture'), regression: arg(a, '--regression') === '1',
      base: { metric: ok(b) ? metricOf(b, metric) : null, cost: costOf(b) },
      head: { metric: ok(h) ? metricOf(h, metric) : null, cost: costOf(h) },
    }));
  } else if (cmd === 'cost') {
    try { console.log(costOf(JSON.parse(readFileSync(a[0], 'utf8')))); } catch { console.log(0); }
  } else if (cmd === 'status') {
    try { console.log(JSON.parse(readFileSync(a[0], 'utf8')).status || 'unknown'); } catch { console.log('missing'); }
  } else if (cmd === 'decide' || cmd === 'report') {
    const pairs = readPairs(a[0]);
    const opts = { tol: Number(arg(a, '--tol', 0.02)), min: Number(arg(a, '--min', 5)), costRatio: Number(arg(a, '--cost-ratio', 1.25)), final: a.includes('--final') || cmd === 'report' };
    const d = decide(pairs, opts);
    if (cmd === 'decide') console.log(JSON.stringify(d));
    else console.log(report(pairs, d, { base: arg(a, '--base', 'base'), head: arg(a, '--head', 'head'), spent: Number(arg(a, '--spent', 0)), cachedPairs: Number(arg(a, '--cached', 0)) }));
  } else {
    console.error('usage: compare.mjs select|decide|report …'); process.exit(2);
  }
}
