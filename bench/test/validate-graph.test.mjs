import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../skills/plan/validate-graph.mjs';

const t = (id, depends_on = [], owns = [`src/${id}.cs`]) =>
  ({ id, title: id, depends_on, owns, reads: [], instructions: '1. do it', verify: 'dotnet test', done_when: ['tests pass'] });
const g = tasks => ({ goal: 'g', spec: 'SPEC.md', base_branch: 'main', verify_all: 'dotnet test', tasks });

test('valid_graph_returns_waves', () => {
  const r = validate(g([t('T1'), t('T2', ['T1']), t('T3', ['T1']), t('T4', ['T2', 'T3'])]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.waves, [['T1'], ['T2', 'T3'], ['T4']]);
});

test('rejects_cycle', () => {
  const r = validate(g([t('T1', ['T3']), t('T2', ['T1']), t('T3', ['T2'])]));
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /cycle.*T1.*T2.*T3|cycle.*T2.*T3.*T1|cycle.*T3.*T1.*T2/);
});

test('rejects_unknown_dependency', () => {
  const r = validate(g([t('T1'), t('T2', ['T9'])]));
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('"T9" not found (depended on by T2)'));
});

test('rejects_owns_overlap_in_concurrent_tasks', () => {
  const r = validate(g([t('T1'), t('T2', ['T1'], ['src/A.cs']), t('T3', ['T1'], ['src/A.cs'])]));
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('src/A.cs owned by T2 and T3, which can run at the same time'));
});

test('rejects_overlap_across_waves_when_unordered', () => {
  // T4 is in a later wave than T2 but does not depend on it, so they can overlap in time.
  const r = validate(g([t('T1'), t('T2', [], ['src/A.cs']), t('T4', ['T1'], ['src/A.cs'])]));
  assert.equal(r.ok, false);
});

test('allows_overlap_when_ordered', () => {
  const r = validate(g([t('T2', [], ['src/A.cs']), t('T3', ['T2'], ['src/A.cs'])]));
  assert.equal(r.ok, true);
});

test('rejects_missing_fields', () => {
  const bad = { id: 'T1', owns: [], instructions: '', verify: '' };
  const r = validate(g([bad]));
  assert.equal(r.ok, false);
  for (const f of ['owns', 'instructions', 'verify']) assert.match(r.errors.join('\n'), new RegExp(`T1: missing ${f}`));
});

test('rejects_duplicate_ids', () => {
  const r = validate(g([t('T1'), t('T1')]));
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /duplicate task id T1/);
});
