#!/usr/bin/env node
// Parse one bench run into a result row.
//   node parse-run.mjs <transcript.jsonl> <hidden.log> <judge.json> <meta.json> <base-row-json>
import { readFileSync, existsSync } from 'node:fs';

const [transcriptPath, hiddenLog, judgePath, metaPath, baseJson] = process.argv.slice(2);
const base = JSON.parse(baseJson);
const events = existsSync(transcriptPath)
  ? readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } })
  : [];

const init = events.find(e => e.type === 'system' && e.subtype === 'init') || {};
const result = [...events].reverse().find(e => e.type === 'result') || {};
const lastText = [...events].reverse()
  .filter(e => e.type === 'assistant')
  .flatMap(e => (e.message?.content || []).filter(c => c.type === 'text').map(c => c.text))[0] || '';

let status = 'ok';
if (base.timed_out) status = 'timeout';
else if (result.subtype === 'error_max_budget_usd') status = 'capped';
else if (!result.type || result.is_error) status = 'error';
else if (/\?\s*$/.test(lastText.trim())) status = 'asked';

// Hidden tests: "Failed!  - Failed: 3, Passed: 5, ..." or "Passed!  - Failed: 0, Passed: 8, ..."
const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
const log = existsSync(hiddenLog) ? readFileSync(hiddenLog, 'utf8') : '';
const m = log.match(/Failed:\s*(\d+),\s*Passed:\s*(\d+)/);
const hidden = m
  ? { passed: Number(m[2]), failed: Number(m[1]) }
  : { passed: 0, failed: meta.hidden_total ?? null, build_failed: true };

const judge = existsSync(judgePath) ? JSON.parse(readFileSync(judgePath, 'utf8') || '{}') : {};
const judgeOut = judge.structured_output || (() => { try { return JSON.parse(judge.result); } catch { return {}; } })();

const modelCost = Object.fromEntries(Object.entries(result.modelUsage || {}).map(([k, v]) => [k, v.costUSD]));

console.log(JSON.stringify({
  ...base,
  status,
  cost_usd: result.total_cost_usd ?? null,
  model_cost_usd: modelCost,
  tokens: { input: result.usage?.input_tokens ?? null, output: result.usage?.output_tokens ?? null },
  hidden,
  review_score: judgeOut.score ?? null,
  review_reasons: judgeOut.reasons ?? [],
  judge_cost_usd: judge.total_cost_usd ?? null,
  session_id: result.session_id || init.session_id || null,
  session_model: init.model || null,
  plugins_loaded: (init.plugins || []).map(p => p.name),
  permission_denials: (result.permission_denials || []).length,
  stuck: base.stuck ?? null,
  fix_rounds: base.fix_rounds ?? null,
}, null, 2));
