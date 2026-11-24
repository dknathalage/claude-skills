// Turn a PR's reviewer comments into a checklist of checkable findings (one cheap model call per PR, cached).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object', properties: {
    check: { type: 'string' }, why: { type: 'string' }, path: { type: 'string' }, source: { type: 'array', items: { type: 'string' } } },
    required: ['check', 'source'] } } },
  required: ['items'],
};
export const claudeBin = () => process.env.TEAM_CLAUDE || process.env.BENCH_CLAUDE || 'claude';

export function checklistPrompt(pr, comments) {
  return `${readFileSync(join(ROOT, 'bench/prompts/checklist.md'), 'utf8')}
<pull_request>
Title: ${pr.title}

${pr.body || '(no description)'}
</pull_request>

<comments>
${comments.map(c => `[${c.id}]${c.path ? ` ${c.path}${c.line ? `:${c.line}` : ''}` : ''} ${c.author}: ${c.body}`).join('\n\n')}
</comments>`;
}

// Returns {items: [{id, check, why?, path?, source}], cost_usd, cached}.
export async function extractChecklist(pr, comments, { cacheDir, model = process.env.TEAM_CHECKLIST_MODEL || 'claude-haiku-5-5', budget = 0.5 } = {}) {
  const prompt = checklistPrompt(pr, comments);
  const key = createHash('sha256').update(model + prompt).digest('hex').slice(0, 24);
  const cached = cacheDir && join(cacheDir, `${key}.json`);
  if (cached && existsSync(cached)) return { ...JSON.parse(readFileSync(cached, 'utf8')), cached: true, cost_usd: 0 };
  const { stdout } = await run(claudeBin(), ['-p', prompt, '--model', model, '--output-format', 'json', '--setting-sources', 'project,local',
    '--json-schema', JSON.stringify(SCHEMA), '--max-budget-usd', String(budget)], { cwd: process.env.TMPDIR || '/tmp', maxBuffer: 64 * 1024 * 1024 });
  const env = JSON.parse(stdout);
  const out = env.structured_output || JSON.parse(env.result);
  const items = (out.items || []).filter(i => i.check?.trim()).map((i, n) => ({ id: `k${n + 1}`, ...i }));
  const result = { items, model };
  if (cached) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cached, JSON.stringify(result)); }
  return { ...result, cached: false, cost_usd: env.total_cost_usd || 0 };
}
