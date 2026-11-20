import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWorkflow } from './lib/run-workflow.mjs';
import { validate } from '../../skills/plan/validate-graph.mjs';

const SCRIPT = new URL('../../skills/build/swarm.workflow.js', import.meta.url).pathname;
const task = (id, depends_on = []) => ({ id, title: id, depends_on, owns: [`src/${id}.cs`], reads: [],
  instructions: `1. write ${id}`, verify: `dotnet test --filter ${id}`, done_when: ['tests pass'] });
const graph = tasks => ({ goal: 'g', spec: 'SPEC.md', base_branch: 'main', verify_all: 'dotnet test', tasks });
const argsFor = (tasks, mode = {}) => {
  const g = graph(tasks);
  return { graph: g, waves: validate(g).waves, topic: 'demo', mode: { isolation: 'worktree', check: true, serial: false, ...mode } };
};
const id = opts => (opts.label || '').split(':')[1];
const kind = opts => (opts.label || '').split(':')[0];

// Default fake: every stage succeeds.
const happy = (overrides = {}) => async (prompt, opts) => {
  const k = kind(opts);
  if (overrides[k]) { const r = await overrides[k](prompt, opts); if (r !== undefined) return r; }
  if (k === 'implement') return { status: 'done', files_changed: [`src/${id(opts)}.cs`], verify_passed: true, verify_tail: 'ok', notes: '' };
  if (k === 'check') return { pass: true, problems: [] };
  if (k === 'integrate') return { ok: true, conflicts: [], verify_all_passed: true, verify_all_tail: 'ok' };
  if (k === 'review') return { findings: [] };
  throw new Error(`unexpected label ${opts.label}`);
};
const count = (calls, k, tid) => calls.filter(c => kind(c.opts) === k && (!tid || id(c.opts) === tid)).length;

test('all_pass_returns_summary', async () => {
  const { result, calls } = await runWorkflow(SCRIPT, argsFor([task('T1'), task('T2'), task('T3', ['T1'])]), happy());
  assert.deepEqual(result.totals, { tasks: 3, passed: 3, stuck: 0, skipped: 0 });
  assert.deepEqual(result.tasks.map(t => t.id), ['T1', 'T2', 'T3']);
  assert.equal(count(calls, 'integrate'), 1);
  assert.equal(count(calls, 'review'), 1);
  assert.equal(result.integrate.ok, true);
});

test('workers_use_haiku', async () => {
  const { calls } = await runWorkflow(SCRIPT, argsFor([task('T1'), task('T2')]), happy());
  for (const c of calls) {
    if (['implement', 'check', 'integrate'].includes(kind(c.opts))) assert.equal(c.opts.model, 'haiku', c.opts.label);
    if (kind(c.opts) === 'review') assert.equal(c.opts.model, undefined);
  }
});

test('check_flags_edit_outside_owns', async () => {
  let checks = 0;
  const fake = happy({ check: async () => (checks++ === 0 ? { pass: false, problems: ['edited Program.cs, which is not in owns'] } : undefined) });
  const { result, calls } = await runWorkflow(SCRIPT, argsFor([task('T1')]), fake);
  const impls = calls.filter(c => kind(c.opts) === 'implement');
  assert.equal(impls.length, 2);
  assert.match(impls[1].prompt, /edited Program\.cs, which is not in owns/);
  assert.equal(result.tasks[0].status, 'pass');
  assert.equal(result.tasks[0].fix_rounds, 1);
});

test('stuck_after_two_fix_rounds', async () => {
  const fake = happy({ check: async () => ({ pass: false, problems: ['still failing'] }) });
  const { result, calls } = await runWorkflow(SCRIPT, argsFor([task('T1')]), fake);
  assert.equal(count(calls, 'implement', 'T1'), 3);
  assert.equal(result.tasks[0].status, 'stuck');
  assert.equal(result.tasks[0].fix_rounds, 2);
  assert.ok(calls.every(c => c.opts.model === undefined || c.opts.model === 'haiku'), 'never escalates');
});

test('dependents_of_stuck_are_skipped', async () => {
  const fake = happy({ check: async (p, o) => (id(o) === 'T1' ? { pass: false, problems: ['bad'] } : undefined) });
  const { result, calls } = await runWorkflow(SCRIPT, argsFor([task('T1'), task('T2'), task('T3', ['T1'])]), fake);
  const st = Object.fromEntries(result.tasks.map(t => [t.id, t.status]));
  assert.deepEqual(st, { T1: 'stuck', T2: 'pass', T3: 'skipped' });
  assert.equal(count(calls, 'implement', 'T3'), 0);
  assert.deepEqual(result.totals, { tasks: 3, passed: 1, stuck: 1, skipped: 1 });
});

test('serial_mode_runs_one_at_a_time', async () => {
  let active = 0, maxActive = 0;
  const slow = async () => { active++; maxActive = Math.max(maxActive, active); await new Promise(r => setTimeout(r, 5)); active--; };
  const fake = happy({ implement: async () => { await slow(); return undefined; } });
  await runWorkflow(SCRIPT, argsFor([task('T1'), task('T2'), task('T3')], { serial: true }), fake);
  assert.equal(maxActive, 1);
});

test('parallel_mode_overlaps_independent_tasks', async () => {
  let active = 0, maxActive = 0;
  const fake = happy({ implement: async () => { active++; maxActive = Math.max(maxActive, active); await new Promise(r => setTimeout(r, 5)); active--; return undefined; } });
  await runWorkflow(SCRIPT, argsFor([task('T1'), task('T2'), task('T3')]), fake);
  assert.ok(maxActive > 1);
});

test('dependent_waits_for_dependency', async () => {
  const order = [];
  const fake = happy({ implement: async (p, o) => { order.push(`start:${id(o)}`); await new Promise(r => setTimeout(r, id(o) === 'T1' ? 10 : 1)); order.push(`end:${id(o)}`); return undefined; } });
  await runWorkflow(SCRIPT, argsFor([task('T1'), task('T2', ['T1'])]), fake);
  assert.ok(order.indexOf('end:T1') < order.indexOf('start:T2'));
});

test('no_check_mode_skips_check', async () => {
  const { calls, result } = await runWorkflow(SCRIPT, argsFor([task('T1'), task('T2')], { check: false }), happy());
  assert.equal(count(calls, 'check'), 0);
  assert.equal(result.totals.passed, 2);
});

test('no_check_mode_still_fails_on_red_verify', async () => {
  const fake = happy({ implement: async () => ({ status: 'done', files_changed: [], verify_passed: false, verify_tail: 'FAIL', notes: '' }) });
  const { result } = await runWorkflow(SCRIPT, argsFor([task('T1')], { check: false }), fake);
  assert.equal(result.tasks[0].status, 'stuck');
});

test('shared_mode_prompt_sets_build_output', async () => {
  const { calls } = await runWorkflow(SCRIPT, argsFor([task('T1')], { isolation: 'shared' }), happy());
  const impl = calls.find(c => kind(c.opts) === 'implement');
  assert.match(impl.prompt, /\.build\/T1/);
  assert.match(impl.prompt, /do not commit/i);
  assert.equal(impl.opts.isolation, undefined);
});

test('worktree_mode_uses_isolation', async () => {
  const { calls } = await runWorkflow(SCRIPT, argsFor([task('T1'), task('T2', ['T1'])]), happy());
  const impl2 = calls.find(c => kind(c.opts) === 'implement' && id(c.opts) === 'T2');
  assert.equal(impl2.opts.isolation, 'worktree');
  assert.match(impl2.prompt, /git checkout -b swarm\/demo\/T2/);
  assert.match(impl2.prompt, /git merge (--no-edit )?swarm\/demo\/T1/);
});

test('integrate_lists_only_passed_tasks_in_order', async () => {
  const fake = happy({ check: async (p, o) => (id(o) === 'T2' ? { pass: false, problems: ['x'] } : undefined) });
  const { calls } = await runWorkflow(SCRIPT, argsFor([task('T1'), task('T2'), task('T3', ['T1'])]), fake);
  const integ = calls.find(c => kind(c.opts) === 'integrate');
  assert.match(integ.prompt, /swarm\/demo\/T1[\s\S]*swarm\/demo\/T3/);
  assert.doesNotMatch(integ.prompt, /swarm\/demo\/T2/);
  assert.match(integ.prompt, /on build\/demo/);
});

test('task_branches_never_nest_under_feature_branch', async () => {
  const { calls } = await runWorkflow(SCRIPT, argsFor([task('T1')]), happy());
  const impl = calls.find(c => kind(c.opts) === 'implement');
  assert.doesNotMatch(impl.prompt, /build\/demo\//);
});

test('worktree_check_runs_in_its_own_worktree_inside_project', async () => {
  const { calls } = await runWorkflow(SCRIPT, argsFor([task('T1')]), happy());
  const chk = calls.find(c => kind(c.opts) === 'check');
  assert.equal(chk.opts.isolation, 'worktree');
  assert.doesNotMatch(chk.prompt, /\.\.\/check-/);
  assert.match(chk.prompt, /git checkout --detach swarm\/demo\/T1/);
});

// ---- timeouts ----
const never = () => new Promise(() => {});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T = { implement_min: 0.001, check_min: 0.001, integrate_min: 0.001, review_min: 0.001 }; // 60 ms

test('implement_timeout_marks_task_stuck_without_retry', async () => {
  const fake = happy({ implement: async (p, o) => (id(o) === 'T1' ? never() : undefined) });
  const { result, calls } = await runWorkflow(SCRIPT, argsFor([task('T1'), task('T2')], { timeouts: T }), fake);
  const t1 = result.tasks.find(t => t.id === 'T1');
  assert.equal(t1.status, 'stuck');
  assert.equal(t1.timed_out, true);
  assert.equal(count(calls, 'implement', 'T1'), 1);
  assert.equal(result.tasks.find(t => t.id === 'T2').status, 'pass');
});

test('check_timeout_marks_task_stuck', async () => {
  const fake = happy({ check: async () => never() });
  const { result } = await runWorkflow(SCRIPT, argsFor([task('T1')], { timeouts: T }), fake);
  assert.equal(result.tasks[0].status, 'stuck');
  assert.equal(result.tasks[0].timed_out, true);
});

test('integrate_and_review_timeouts_still_return_summary', async () => {
  const fake = happy({ integrate: async () => never(), review: async () => never() });
  const { result } = await runWorkflow(SCRIPT, argsFor([task('T1')], { timeouts: T }), fake);
  assert.equal(result.integrate.ok, false);
  assert.match(result.integrate.conflicts.join(' '), /timed out/);
  assert.equal(result.review.timed_out, true);
});

test('deadline_stops_starting_new_tasks', async () => {
  const fake = happy({ implement: async (p, o) => { if (id(o) === 'T1') await sleep(120); return undefined; } });
  const { result, calls } = await runWorkflow(SCRIPT, argsFor([task('T1'), task('T2', ['T1'])], { deadline_min: 0.001 }), fake);
  const st = Object.fromEntries(result.tasks.map(t => [t.id, t.status]));
  assert.equal(st.T1, 'pass');
  assert.equal(st.T2, 'skipped');
  assert.match(result.tasks.find(t => t.id === 'T2').reason, /deadline/);
  assert.equal(count(calls, 'implement', 'T2'), 0);
  assert.equal(result.deadline_hit, true);
});

test('timers_do_not_outlive_the_workflow', async () => {
  // Default timeouts are many minutes; the workflow must clear its timers or this file never exits.
  const started = process.hrtime.bigint();
  await runWorkflow(SCRIPT, argsFor([task('T1')]), happy());
  assert.ok(Number(process.hrtime.bigint() - started) / 1e6 < 2000);
});
