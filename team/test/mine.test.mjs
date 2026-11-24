import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'mine-'));
const user = (login, type = 'User') => ({ login, type });
const map = {
  'repos/acme/api/pulls/7': { number: 7, title: 'PAY-12 add retry', body: 'Fixes PAY-12 and ops-3', user: user('dev1'), merged_at: '2026-05-02T00:00:00Z', created_at: '2026-05-01T00:00:00Z', labels: [{ name: 'backend' }], base: { sha: 'b1' }, head: { ref: 'PAY-12-retry' } },
  'repos/acme/api/pulls/7/comments': [
    { id: 1, user: user('rev1'), path: 'a.go', line: 10, original_commit_id: 'c1', body: 'Wrap this error with context.', created_at: '2026-05-01T10:00:00Z' },
    { id: 2, user: user('dev1'), path: 'a.go', line: 10, original_commit_id: 'c1', body: 'Done', created_at: '2026-05-01T11:00:00Z', in_reply_to_id: 1 },
    { id: 3, user: user('ci[bot]', 'Bot'), path: 'a.go', line: 1, original_commit_id: 'c1', body: 'coverage 80%', created_at: '2026-05-01T10:30:00Z' },
  ],
  'repos/acme/api/pulls/7/reviews': [{ id: 9, user: user('rev1'), commit_id: 'c1', body: 'Needs a test for the retry cap.', submitted_at: '2026-05-01T10:05:00Z', state: 'CHANGES_REQUESTED' }],
  'repos/acme/api/issues/7/comments': [{ id: 5, user: user('rev2'), body: 'Please also update the runbook', created_at: '2026-05-01T12:00:00Z' }],
  'repos/acme/api/compare/b1...c1': 'diff --git a/a.go b/a.go\n+retry()\n',
  'repos/acme/api/pulls/8': { number: 8, title: 'draft', body: '', user: user('dev1'), merged_at: null, base: { sha: 'b2' }, head: { ref: 'x' } },
  'repos/acme/api/pulls/9': { number: 9, title: 'self merge', body: '', user: user('dev1'), merged_at: '2026-05-03T00:00:00Z', created_at: '2026-05-03T00:00:00Z', labels: [], base: { sha: 'b3' }, head: { ref: 'y' } },
  'repos/acme/api/pulls/9/comments': [], 'repos/acme/api/pulls/9/reviews': [], 'repos/acme/api/issues/9/comments': [],
  'repos/acme/api/pulls?state=closed&sort=updated&direction=desc': [
    { number: 7, merged_at: '2026-05-02T00:00:00Z', user: user('dev1') }, { number: 8, merged_at: null, user: user('dev1') },
    { number: 10, merged_at: '2026-05-04T00:00:00Z', user: user('dependabot[bot]', 'Bot') }, { number: 11, merged_at: '2025-01-01T00:00:00Z', user: user('dev1') },
  ],
};
writeFileSync(join(tmp, 'map.json'), JSON.stringify(map));
process.env.GH_BIN = join(here, 'stubs/gh');
process.env.GH_STUB_MAP = join(tmp, 'map.json');
process.env.GH_STUB_LOG = join(tmp, 'calls.log');
const { isReadOnlyArgs } = await import('../lib/gh-read.mjs');
const { minePr, listMerged } = await import('../mine.mjs');

test('only_plain_get_requests_are_allowed', () => {
  const ok = ['api', 'repos/a/b/pulls/1', '-H', 'Accept: application/vnd.github+json'];
  assert.equal(isReadOnlyArgs(ok), true);
  assert.equal(isReadOnlyArgs(['api', 'repos/a/b/compare/x...y', '-H', 'Accept: application/vnd.github.diff']), true);
  for (const bad of [
    [...ok, '-X', 'POST'], [...ok, '--method', 'PATCH'], [...ok, '-f', 'body=hi'], [...ok, '-F', 'body=hi'], [...ok, '--input', 'x.json'],
    ['api', 'user'], ['api', 'graphql'], ['pr', 'comment', '1'], ['api', 'repos/a/b/issues/1/comments', '-X', 'POST'], [...ok, '-H', 'X-Evil: 1'],
  ]) assert.equal(isReadOnlyArgs(bad), false, JSON.stringify(bad));
});

test('mines_a_reviewed_pr_with_frozen_diff_and_human_comments_only', async () => {
  const r = await minePr('acme/api', 7, join(tmp, 'out'));
  assert.equal(r.status, 'mined');
  const d = join(tmp, 'out/acme__api/7');
  const pr = JSON.parse(readFileSync(join(d, 'pr.json'), 'utf8'));
  assert.equal(pr.review_commit, 'c1');
  assert.deepEqual(pr.jira, ['PAY-12']);
  assert.match(readFileSync(join(d, 'diff.patch'), 'utf8'), /retry\(\)/);
  const comments = JSON.parse(readFileSync(join(d, 'comments.json'), 'utf8'));
  assert.deepEqual(comments.map(c => c.author).sort(), ['rev1', 'rev1', 'rev2']);
  assert.ok(!comments.some(c => c.author === 'dev1' || /bot/.test(c.author)));
});

test('skips_unmerged_and_unreviewed_prs_and_caches', async () => {
  assert.match((await minePr('acme/api', 8, join(tmp, 'out'))).status, /not merged/);
  assert.match((await minePr('acme/api', 9, join(tmp, 'out'))).status, /no human review/);
  assert.equal((await minePr('acme/api', 7, join(tmp, 'out'))).status, 'cached');
  assert.equal(existsSync(join(tmp, 'out/acme__api/9/pr.json')), false);
});

test('lists_merged_prs_skipping_bots_and_old_ones', async () => {
  assert.deepEqual(await listMerged('acme/api', { since: '2026-01-01' }), [7]);
});

test('every_github_call_made_was_a_read', () => {
  const calls = readFileSync(join(tmp, 'calls.log'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.ok(calls.length > 5);
  for (const c of calls) assert.equal(isReadOnlyArgs(c), true, JSON.stringify(c));
});
