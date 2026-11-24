import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatches, reviewRow } from '../lib/review-row.mjs';

const cl = { items: [{ id: 'k1' }, { id: 'k2' }, { id: 'k3' }, { id: 'k4' }] };

test('recall_precision_and_noise', () => {
  const s = scoreMatches(cl, {
    matches: [{ item: 'k1', draft: 1 }, { item: 'k2', draft: 1 }, { item: 'k3', draft: null }, { item: 'k4', draft: 3 }],
    draft_count: 5, extras: [{ draft: 2, plausible: true }, { draft: 4, plausible: false }, { draft: 5, plausible: false }, { draft: 1, plausible: false }],
  });
  assert.equal(s.recall, 0.75);
  assert.equal(s.precision, 2 / 5); // drafts 1 and 3 matched something
  assert.equal(s.plausible_extras, 1);
  assert.equal(s.noise, 2); // draft 1 is not an extra: it matched
});

test('unknown_item_ids_from_the_judge_are_ignored', () => {
  const s = scoreMatches(cl, { matches: [{ item: 'zz', draft: 1 }, { item: 'k1', draft: 2 }], draft_count: 2, extras: [] });
  assert.equal(s.matched, 1);
});

test('status_reflects_failures_and_never_scores_them', () => {
  const ok = { type: 'result', is_error: false, total_cost_usd: 1 };
  const judge = { structured_output: { matches: [{ item: 'k1', draft: 1 }], draft_count: 1, extras: [] } };
  assert.equal(reviewRow({ events: [ok], judge, checklist: cl, draftExists: true, base: {} }).status, 'ok');
  assert.equal(reviewRow({ events: [ok], judge, checklist: cl, draftExists: false, base: {} }).status, 'no_draft');
  assert.equal(reviewRow({ events: [{ type: 'result', subtype: 'error_max_budget_usd', is_error: true }], judge, checklist: cl, draftExists: true, base: {} }).status, 'capped');
  assert.equal(reviewRow({ events: [ok], judge: null, checklist: cl, draftExists: true, base: {} }).status, 'judge_failed');
  assert.equal(reviewRow({ events: [ok], judge, checklist: cl, draftExists: true, base: { timed_out: true } }).status, 'timeout');
  assert.equal(reviewRow({ events: [ok], judge, checklist: cl, draftExists: false, base: {} }).recall, undefined);
});
