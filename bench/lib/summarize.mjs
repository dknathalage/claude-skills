#!/usr/bin/env node
// Summarise bench result rows.
//   node bench/lib/summarize.mjs <exp>   → writes bench/results/<exp>.md, prints it
//   node bench/lib/summarize.mjs --spend → prints total cost_usd over every raw row
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const median = xs => {
  const v = xs.filter(x => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

const passRate = r => {
  const h = r.hidden || {};
  const total = (h.passed || 0) + (h.failed || 0);
  return total ? h.passed / total : null;
};

export function summarize(rows) {
  const byArm = new Map();
  for (const r of rows) {
    const key = r.fixture ? `${r.arm}` + (rows.some(x => x.fixture !== r.fixture) ? ` / ${r.fixture}` : '') : r.arm;
    if (!byArm.has(key)) byArm.set(key, []);
    byArm.get(key).push(r);
  }
  const arms = [...byArm.entries()].map(([arm, rs]) => ({
    arm,
    n: rs.length,
    failures: rs.filter(r => r.status !== 'ok').length,
    needed_human: rs.some(r => r.status === 'asked'),
    wall_ms: median(rs.map(r => r.wall_ms)),
    cost_usd: median(rs.map(r => r.cost_usd)),
    hidden_pass_rate: median(rs.map(passRate)),
    review_score: median(rs.map(r => r.review_score)),
    stuck: median(rs.map(r => r.stuck)),
    spend: totalSpend(rs),
  }));
  const fmt = (v, d = 2) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));
  const lines = [
    '| arm | n | failures | median wall (s) | median cost ($) | hidden pass | review | stuck | spend ($) | notes |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...arms.map(a => `| ${a.arm} | ${a.n} | ${a.failures} | ${fmt(a.wall_ms / 1000, 0)} | ${fmt(a.cost_usd)} | ${a.hidden_pass_rate === null ? '—' : Math.round(a.hidden_pass_rate * 100) + '%'} | ${fmt(a.review_score, 1)} | ${fmt(a.stuck, 0)} | ${fmt(a.spend)} | ${a.needed_human ? 'needed human' : ''} |`),
  ];
  return { arms, markdown: lines.join('\n') };
}

export function totalSpend(rows) {
  return rows.reduce((s, r) => s + (r.cost_usd || 0) + (r.judge_cost_usd || 0), 0);
}

function readRows(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...readRows(p));
    else if (f.endsWith('.json')) out.push(JSON.parse(readFileSync(p, 'utf8')));
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');
  const arg = process.argv[2];
  if (arg === '--spend') {
    console.log(totalSpend(readRows(join(results, 'raw'))).toFixed(2));
  } else if (arg) {
    const { markdown } = summarize(readRows(join(results, 'raw', arg)));
    const path = join(results, `${arg}.md`);
    const prev = existsSync(path) ? readFileSync(path, 'utf8') : `# ${arg}\n\n<!-- table -->\n<!-- /table -->\n\n## Verdict\n\n_TBD_\n`;
    const next = prev.includes('<!-- table -->')
      ? prev.replace(/<!-- table -->[\s\S]*<!-- \/table -->/, `<!-- table -->\n${markdown}\n<!-- /table -->`)
      : `${prev}\n${markdown}\n`;
    writeFileSync(path, next);
    console.log(markdown);
  } else {
    console.error('usage: summarize.mjs <exp> | --spend');
    process.exit(2);
  }
}
