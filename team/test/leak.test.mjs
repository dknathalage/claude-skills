import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLeaks, shingles } from '../leak-check.mjs';

const holdout = [{ source: 'pr-9/reference/comments.json', text: 'Please wrap this error with the request id so support can trace the failing payment run' }];

test('detects_an_eight_word_run_copied_from_holdout', () => {
  const skill = '# team-review\nAlways: wrap this error with the request id so support can trace it.';
  assert.ok(findLeaks(skill, holdout).length > 0);
});

test('allows_a_reworded_principle_and_short_overlaps', () => {
  const skill = 'Errors crossing a service boundary carry an identifier, because support needs to trace them. Wrap this error.';
  assert.deepEqual(findLeaks(skill, holdout), []);
  assert.equal(shingles('a b c', 8).size, 0);
});
