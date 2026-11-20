import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, totalSpend } from '../lib/summarize.mjs';

const row = (arm, rep, o = {}) => ({
  exp: 'E1', arm, fixture: 'f-medium', rep, status: 'ok',
  wall_ms: 1000 * rep, cost_usd: rep, tokens: { input: 0, output: 0 },
  hidden: { passed: 9, failed: 1 }, review_score: 7, ...o,
});

test('medians_per_arm', () => {
  const rows = [row('swarm', 1), row('swarm', 2), row('swarm', 9),
                row('serial', 3), row('serial', 4), row('serial', 5)];
  const s = summarize(rows);
  const swarm = s.arms.find(a => a.arm === 'swarm');
  assert.equal(swarm.n, 3);
  assert.equal(swarm.wall_ms, 2000);
  assert.equal(swarm.cost_usd, 2);
  assert.equal(swarm.hidden_pass_rate, 0.9);
  assert.match(s.markdown, /\| swarm \|/);
});

test('capped_counts_as_failure', () => {
  const rows = [row('a', 1), row('a', 2, { status: 'capped', hidden: { passed: 0, failed: 10 } }), row('a', 3)];
  const a = summarize(rows).arms[0];
  assert.equal(a.n, 3);
  assert.equal(a.failures, 1);
  assert.equal(a.hidden_pass_rate, 0.9); // median of 0.9, 0, 0.9
});

test('asked_flagged', () => {
  const s = summarize([row('a', 1, { status: 'asked' }), row('b', 1)]);
  assert.equal(s.arms.find(x => x.arm === 'a').needed_human, true);
  assert.equal(s.arms.find(x => x.arm === 'b').needed_human, false);
  assert.match(s.markdown, /needed human/);
});

test('total_spend', () => {
  assert.equal(totalSpend([row('a', 1), row('b', 2.5, { judge_cost_usd: 0.5 }), { cost_usd: null }]), 4);
});
