import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agreement, summarise } from '../calibrate-judge.mjs';

test('agreement_counts_each_checklist_item', () => {
  const a = agreement(['k1', 'k2', 'k3', 'k4'], new Set(['k1', 'k2']), new Set(['k1', 'k3']));
  assert.deepEqual(a, { tp: 1, fp: 1, fn: 1, tn: 1 });
});

test('summary_reports_accuracy_precision_recall', () => {
  const s = summarise([{ tp: 3, fp: 1, fn: 0, tn: 6 }, { tp: 1, fp: 0, fn: 2, tn: 7 }]);
  assert.equal(s.n, 20);
  assert.equal(s.accuracy, 17 / 20);
  assert.equal(s.judge_precision, 4 / 5);
  assert.equal(s.judge_recall, 4 / 6);
});
