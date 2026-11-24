import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decide, selectFixtures, changedSkills, metricOf, exitCodeFor } from '../lib/compare.mjs';
import { skillHashes } from '../lib/skillhash.mjs';
import { parseAllow, violations } from '../lib/guard.mjs';

const pair = (f, b, h, o = {}) => ({ fixture: f, regression: false, base: { metric: b, cost: 1 }, head: { metric: h, cost: 1 }, ...o });
const many = (n, b, h) => Array.from({ length: n }, (_, i) => pair(`f${i}`, b + (i % 3) * 0.01, h + (i % 3) * 0.01));

test('better_when_every_pair_improves', () => {
  const d = decide(many(8, 0.5, 0.6));
  assert.equal(d.verdict, 'BETTER');
  assert.equal(d.stop, true);
  assert.equal(exitCodeFor(d.verdict), 0);
});

test('worse_when_every_pair_drops', () => {
  const d = decide(many(8, 0.6, 0.4));
  assert.equal(d.verdict, 'WORSE');
  assert.equal(exitCodeFor(d.verdict), 1);
});

test('no_worse_when_flat_and_says_not_proven', () => {
  const d = decide(many(12, 0.5, 0.5), { final: true });
  assert.equal(d.verdict, 'NO_WORSE');
  assert.equal(exitCodeFor(d.verdict), 0);
});

test('inconclusive_below_min_pairs', () => {
  const d = decide(many(3, 0.5, 0.9));
  assert.equal(d.verdict, 'INCONCLUSIVE');
  assert.equal(d.stop, false);
  assert.equal(exitCodeFor(d.verdict), 2);
});

test('one_regression_case_dropping_is_worse_even_if_mean_improves', () => {
  const pairs = [...many(8, 0.5, 0.7), pair('reg1', 0.9, 0.5, { regression: true })];
  const d = decide(pairs);
  assert.equal(d.verdict, 'WORSE');
  assert.deepEqual(d.regression_failures, ['reg1']);
});

test('cost_up_when_better_but_much_dearer', () => {
  const pairs = many(8, 0.5, 0.6).map(p => ({ ...p, head: { ...p.head, cost: 2 } }));
  const d = decide(pairs);
  assert.equal(d.verdict, 'COST_UP');
  assert.equal(exitCodeFor(d.verdict), 3);
});

test('failed_runs_are_dropped_not_counted_as_zero', () => {
  const pairs = [...many(8, 0.5, 0.6), pair('bad', 0.5, null)];
  const d = decide(pairs);
  assert.equal(d.dropped, 1);
  assert.equal(d.n, 8);
});

test('decide_is_deterministic', () => {
  const pairs = many(9, 0.5, 0.52);
  assert.deepEqual(decide(pairs), decide(pairs));
});

test('metric_prefers_recall_then_hidden_pass_rate', () => {
  assert.equal(metricOf({ recall: 0.75, hidden: { passed: 1, failed: 1 } }), 0.75);
  assert.equal(metricOf({ hidden: { passed: 3, failed: 1 } }), 0.75);
  assert.equal(metricOf({}), null);
});

test('skill_hash_ignores_plugin_json_but_sees_skill_text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sh-'));
  mkdirSync(join(dir, 'skills/team-a'), { recursive: true });
  mkdirSync(join(dir, '.claude-plugin'));
  writeFileSync(join(dir, 'skills/team-a/SKILL.md'), 'one');
  writeFileSync(join(dir, '.claude-plugin/plugin.json'), '{"version":"1"}');
  const a = skillHashes(dir);
  writeFileSync(join(dir, '.claude-plugin/plugin.json'), '{"version":"2"}');
  assert.equal(skillHashes(dir).plugin, a.plugin);
  writeFileSync(join(dir, 'skills/team-a/SKILL.md'), 'two');
  assert.notEqual(skillHashes(dir).plugin, a.plugin);
  assert.deepEqual(changedSkills(a, skillHashes(dir)), ['team-a']);
});

test('select_runs_regression_first_and_only_affected_fixtures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fx-'));
  const mk = (n, meta) => { mkdirSync(join(dir, n)); writeFileSync(join(dir, n, 'meta.json'), JSON.stringify(meta)); };
  mk('a-any', {});
  mk('b-review', { skills: ['team-review'] });
  mk('c-other', { skills: ['team-jira'] });
  mk('d-reg', { regression: true, skills: ['team-review'] });
  const names = selectFixtures(dir, ['team-review']).map(p => p.name);
  assert.equal(names[0], 'd-reg');
  assert.deepEqual([...names].sort(), ['a-any', 'b-review', 'd-reg']);
  assert.deepEqual(selectFixtures(dir, []), []);
});

test('guard_allows_team_skills_and_new_regress_files_only', () => {
  const rules = parseAllow('edit skills/team-*/**\nadd bench/regress/**\n');
  const ch = (status, path) => ({ status, path });
  assert.deepEqual(violations([ch('M', 'skills/team-review/SKILL.md'), ch('A', 'skills/team-new/ref/x.md'), ch('A', 'bench/regress/c1/meta.json')], rules), []);
  const bad = violations([
    ch('M', 'skills/improver/SKILL.md'), ch('M', 'bench/lib/compare.mjs'), ch('M', 'bench/regress/c1/meta.json'),
    ch('D', 'bench/regress/c1/meta.json'), ch('M', 'bench/improver-allow'), ch('M', 'hooks/hooks.json'),
  ], rules);
  assert.equal(bad.length, 6);
});
