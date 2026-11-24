import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { denies } from '../../hooks/no-post.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const bash = command => denies('Bash', { command });

test('blocks_github_writes_and_allows_reads', () => {
  for (const c of ['gh pr comment 12 --body hi', 'gh pr review 3 --approve', 'gh issue comment 4 -b x', 'gh pr merge 1', 'gh pr create -t x',
    'gh api repos/a/b/issues/1/comments -f body=hi', 'gh api -X POST repos/a/b/pulls', 'gh api --method=PATCH repos/a/b/pulls/1', 'gh api repos/a/b/x --input body.json', 'git push origin main'])
    assert.ok(bash(c), c);
  for (const c of ['gh pr view 12', 'gh pr diff 12', 'gh api repos/a/b/pulls/1', 'gh api -X GET repos/a/b/pulls', 'git status', 'git log -3', 'ls'])
    assert.equal(bash(c), null, c);
});

test('blocks_http_writes_to_team_systems_only', () => {
  assert.ok(bash('curl -X POST https://slack.com/api/chat.postMessage -d text=hi'));
  assert.ok(bash('curl -H "Authorization: x" --data @b.json https://acme.atlassian.net/rest/api/3/issue/PAY-1/comment'));
  assert.equal(bash('curl -s https://acme.atlassian.net/rest/api/3/issue/PAY-1'), null);
  assert.equal(bash('curl -X POST https://example.com/hook -d x'), null);
});

test('blocks_mcp_writes_and_allows_mcp_reads', () => {
  for (const t of ['mcp__slack__send_message', 'mcp__claude_ai_Slack__slack_send_message', 'mcp__atlassian__addCommentToJiraIssue', 'mcp__github__create_pull_request_review', 'mcp__github__add_issue_comment'])
    assert.ok(denies(t, {}), t);
  for (const t of ['mcp__slack__search_messages', 'mcp__atlassian__getJiraIssue', 'mcp__github__get_pull_request', 'mcp__github__list_pull_requests', 'Read', 'Write'])
    assert.equal(denies(t, {}), null, t);
});

test('hook_only_acts_when_opted_in', () => {
  const ev = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'gh pr comment 1 --body x' } });
  const run = env => spawnSync('node', [join(ROOT, 'hooks/no-post.mjs')], { input: ev, env: { ...process.env, ...env }, encoding: 'utf8' });
  assert.equal(run({ CLAUDE_SKILLS_NO_POST: '1' }).status, 2);
  assert.match(run({ CLAUDE_SKILLS_NO_POST: '1' }).stderr, /Blocked/);
  assert.equal(run({ CLAUDE_SKILLS_NO_POST: '0' }).status, 0);
});

test('team_tools_contain_no_write_calls', () => {
  const bad = /\bgh\s+(pr|issue)\s+(comment|review)|-X\s*(POST|PUT|PATCH|DELETE)|--method|chat\.postMessage|slack\.com\/api|createComment|addComment/;
  const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? (f === 'test' ? [] : walk(p)) : [p]; });
  for (const f of walk(join(ROOT, 'team')).filter(f => f.endsWith('.mjs'))) assert.doesNotMatch(readFileSync(f, 'utf8'), bad, f);
});

test('no_post_hook_is_a_no_op_without_node_when_not_opted_in', () => {
  const h = JSON.parse(readFileSync(join(ROOT, 'hooks/hooks.json'), 'utf8'));
  const cmd = h.hooks.PreToolUse[0].hooks[0].command;
  assert.match(cmd, /^"\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/no-post"$/);
  const ev = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push' } });
  const off = spawnSync(join(ROOT, 'hooks/no-post'), { input: ev, env: { PATH: '' }, encoding: 'utf8' });
  assert.equal(off.status, 0);
  const on = spawnSync(join(ROOT, 'hooks/no-post'), { input: ev, env: { PATH: process.env.PATH, CLAUDE_SKILLS_NO_POST: '1' }, encoding: 'utf8' });
  assert.equal(on.status, 2);
});
