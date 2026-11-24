#!/usr/bin/env node
// Build a result row for one review run.
//   node bench/lib/review-row.mjs <transcript.jsonl> <judge.json> <checklist.json> <draft-exists 0|1> <base-row-json>
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function scoreMatches(checklist, judged) {
  const ids = new Set(checklist.items.map(i => i.id));
  const hit = new Map();
  for (const m of judged.matches || []) if (ids.has(m.item) && Number.isInteger(m.draft)) hit.set(m.item, m.draft);
  const n = judged.draft_count || 0;
  const matchedDrafts = new Set(hit.values());
  const extras = (judged.extras || []).filter(e => !matchedDrafts.has(e.draft));
  const plausible = extras.filter(e => e.plausible).length;
  return {
    recall: ids.size ? hit.size / ids.size : null,
    matched: hit.size, items: ids.size, draft_count: n,
    precision: n ? Math.min(1, matchedDrafts.size / n) : null,
    plausible_extras: plausible, noise: extras.length - plausible,
  };
}

export function reviewRow({ events, judge, checklist, draftExists, base }) {
  const result = [...events].reverse().find(e => e.type === 'result') || {};
  let status = 'ok';
  if (base.timed_out) status = 'timeout';
  else if (result.subtype === 'error_max_budget_usd') status = 'capped';
  else if (!result.type || result.is_error) status = 'error';
  else if (!draftExists) status = 'no_draft';
  const out = judge?.structured_output || (() => { try { return JSON.parse(judge?.result); } catch { return null; } })();
  const scored = out && status === 'ok' ? scoreMatches(checklist, out) : {};
  if (status === 'ok' && !out) status = 'judge_failed';
  return { ...base, status, cost_usd: result.total_cost_usd ?? null, judge_cost_usd: judge?.total_cost_usd ?? null, ...scored, session_id: result.session_id || null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [tp, jp, cp, de, baseJson] = process.argv.slice(2);
  const events = existsSync(tp) ? readFileSync(tp, 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } }) : [];
  const judge = existsSync(jp) ? (() => { try { return JSON.parse(readFileSync(jp, 'utf8')); } catch { return null; } })() : null;
  console.log(JSON.stringify(reviewRow({ events, judge, checklist: JSON.parse(readFileSync(cp, 'utf8')), draftExists: de === '1', base: JSON.parse(baseJson) })));
}
