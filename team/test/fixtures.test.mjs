import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { substantive } from '../lib/filters.mjs';
import { splitByTime, buildFixtures } from '../build-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
process.env.TEAM_CLAUDE = join(here, 'stubs/claude');
const tmp = mkdtempSync(join(tmpdir(), 'fx-'));
const mined = join(tmp, 'mined');

const mkPr = (repo, n, day, bodies) => {
  const d = join(mined, repo.replace('/', '__'), String(n));
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'pr.json'), JSON.stringify({ repo, number: n, title: `PR ${n}`, body: `body ${n}`, author: 'dev', labels: [], review_commit: 'c', merged_at: `2026-03-${String(day).padStart(2, '0')}T00:00:00Z`, jira: [] }));
  writeFileSync(join(d, 'diff.patch'), `+code for ${n}\n`);
  writeFileSync(join(d, 'comments.json'), JSON.stringify(bodies.map((b, i) => ({ id: `i${n}${i}`, kind: 'inline', author: 'rev', path: 'a.go', line: 1, commit: 'c', body: b, at: `2026-03-01T0${i}:00:00Z`, reply_to: null }))));
};
for (let n = 1; n <= 10; n++) mkPr('acme/api', n, n, [`SECRET-REVIEW-TEXT-${n}: wrap this error with context`]);
mkPr('acme/web', 50, 2, ['SECRET-REVIEW-TEXT-50: escape this output']);
mkPr('acme/api', 99, 5, ['lgtm', 'ok']);

test('filters_chatter_but_keeps_short_comments_on_code', () => {
  const c = body => ({ body, path: null });
  assert.equal(substantive([c('LGTM'), c('thanks!'), c('ok'), c('Please add a retry cap here')]).length, 1);
  assert.equal(substantive([{ body: 'use const', path: 'a.go' }]).length, 1);
  assert.equal(substantive([{ body: '```go\nx\n```', path: null }]).length, 0);
});

test('split_puts_newest_in_holdout_and_can_hold_out_a_repo', () => {
  const prs = Array.from({ length: 10 }, (_, i) => ({ repo: i === 9 ? 'b/b' : 'a/a', number: i, merged_at: `2026-01-${String(i + 1).padStart(2, '0')}` }));
  const t = splitByTime(prs, { frac: 0.2 });
  assert.deepEqual(t.holdout.map(p => p.number), [8, 9]);
  const r = splitByTime(prs, { frac: 0.2, holdoutRepo: 'b/b' });
  assert.ok(r.holdout.some(p => p.repo === 'b/b') && !r.train.some(p => p.repo === 'b/b'));
  assert.deepEqual(splitByTime(prs.slice(0, 3), {}).holdout, []);
});

test('builds_train_and_holdout_fixtures_with_no_review_text_in_the_agent_input', async () => {
  const out = join(tmp, 'fixtures');
  const r = await buildFixtures({ mined, out, frac: 0.2, holdoutRepo: 'acme/web' });
  assert.equal(r.skipped.some(([id, why]) => id.endsWith('__99') && /substantive/.test(why)), true);
  assert.deepEqual(readdirSync(join(out, 'holdout')).sort(), ['acme__api__10', 'acme__api__9', 'acme__web__50']);
  assert.equal(readdirSync(join(out, 'train')).length, 8);
  const d = join(out, 'holdout/acme__api__10');
  assert.equal(JSON.parse(readFileSync(join(d, 'meta.json'), 'utf8')).skills[0], 'team-review');
  assert.equal(JSON.parse(readFileSync(join(d, 'reference/checklist.json'), 'utf8')).items.length, 1);
  // Leakage guard: nothing the agent will read contains the reviewers' words.
  for (const split of ['train', 'holdout']) for (const id of readdirSync(join(out, split))) {
    for (const f of ['input/pr.md', 'input/diff.patch']) assert.doesNotMatch(readFileSync(join(out, split, id, f), 'utf8'), /SECRET-REVIEW-TEXT/);
  }
});

test('checklist_calls_are_cached_on_rebuild', async () => {
  const log = join(tmp, 'claude.log');
  process.env.STUB_CLAUDE_LOG = log;
  const r = await buildFixtures({ mined, out: join(tmp, 'fixtures'), frac: 0.2, holdoutRepo: 'acme/web' });
  assert.equal(r.spent, 0);
  assert.equal(existsSync(log), false);
});
