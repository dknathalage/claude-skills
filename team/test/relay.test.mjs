import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { similarity, join_, signals } from '../relay.mjs';

const relay = join(dirname(fileURLToPath(import.meta.url)), '../relay.mjs');
const data = mkdtempSync(join(tmpdir(), 'relay-'));
const run = (...a) => execFileSync('node', [relay, ...a], { env: { ...process.env, TEAM_DATA: data }, encoding: 'utf8' }).trim();
const file = (n, t) => { const p = join(data, n); writeFileSync(p, t); return p; };

test('similarity_is_word_overlap', () => {
  assert.equal(similarity('wrap the error', 'wrap the error'), 1);
  assert.equal(similarity('a b c d', 'a b x y'), 2 / 6);
});

test('posted_as_drafted_is_not_a_signal_but_an_edit_is', () => {
  const id1 = run('draft', '--target', 'acme/api#1', '--file', file('d1.md', '1. a.go:1 wrap this error with context so callers can tell the layers apart'));
  assert.match(id1, /^d-\d{4}-\d{2}-\d{2}-[0-9a-f]{6}$/);
  run('posted', '--id', id1, '--same');
  const id2 = run('draft', '--target', 'acme/api#2', '--file', file('d2.md', '1. b.go:5 rename this variable to match the repository convention for handlers'));
  run('posted', '--id', id2, '--file', file('p2.md', 'Please keep handler names short, we use h for http handlers here.'));
  const fb = JSON.parse(run('feedback'));
  assert.equal(fb.drafts, 2);
  assert.deepEqual(fb.signals.map(s => s.id), [id2]);
  assert.ok(fb.signals[0].edit_ratio > 0.5);
});

test('rejected_and_dropped_drafts_are_signals_and_accepted_ones_are_not', () => {
  const mk = (n) => run('draft', '--target', `acme/api#${n}`, '--file', file(`x${n}.md`, `1. c.go:${n} some finding number ${n}`));
  const a = mk(3), b = mk(4), c = mk(5);
  run('posted', '--id', a, '--same'); run('outcome', '--id', a, '--result', 'accepted');
  run('posted', '--id', b, '--same'); run('outcome', '--id', b, '--result', 'rejected', '--note', 'we allow this in tests');
  run('outcome', '--id', c, '--result', 'ignored');
  const ids = JSON.parse(run('feedback')).signals.map(s => s.id);
  assert.ok(!ids.includes(a) && ids.includes(b) && ids.includes(c));
});

test('mark_improved_moves_the_since_last_window', async () => {
  run('mark-improved');
  await new Promise(r => setTimeout(r, 5));
  assert.equal(JSON.parse(run('feedback', '--since-last')).drafts, 0);
  assert.throws(() => run('outcome', '--id', 'nope', '--result', 'accepted'), /no draft/);
  assert.throws(() => run('outcome', '--id', 'x', '--result', 'bogus'));
});

test('join_ ignores records for unknown drafts', () => {
  assert.deepEqual(join_([{ type: 'posted', draft_id: 'zz', text: 'x', at: 't' }]), []);
  assert.deepEqual(signals([]), []);
});
