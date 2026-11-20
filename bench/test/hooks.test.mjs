import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;

test('session_start_injects_using_claude_skills', () => {
  const out = execFileSync(`${ROOT}hooks/session-start`, { env: { PATH: '/usr/bin:/bin', CLAUDE_PLUGIN_ROOT: ROOT } }).toString();
  const json = JSON.parse(out);
  assert.equal(json.hookSpecificOutput.hookEventName, 'SessionStart');
  const ctx = json.hookSpecificOutput.additionalContext;
  const skill = readFileSync(`${ROOT}skills/using-claude-skills/SKILL.md`, 'utf8').trim();
  assert.ok(ctx.includes(skill.split('\n').slice(-3).join('\n')), 'skill body included');
  assert.match(ctx, /claude-skills:using-claude-skills/);
});

test('session_start_works_without_plugin_root_env', () => {
  const out = execFileSync(`${ROOT}hooks/session-start`, { env: { PATH: '' } }).toString();
  assert.ok(JSON.parse(out).hookSpecificOutput.additionalContext.length > 200);
});

test('hooks_json_points_at_session_start', () => {
  const h = JSON.parse(readFileSync(`${ROOT}hooks/hooks.json`, 'utf8'));
  const cmd = h.hooks.SessionStart[0].hooks[0].command;
  assert.match(cmd, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/session-start/);
});
