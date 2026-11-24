import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectFixtures } from '../../bench/lib/compare.mjs';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = mkdtempSync(join(tmpdir(), 'reg-'));
const env = { ...process.env, TEAM_DATA: data };
const node = (script, ...a) => spawnSync('node', [join(here, script), ...a], { env, encoding: 'utf8' });

test('a_corrected_draft_becomes_an_add_only_regression_fixture', () => {
  const input = join(data, 'in'); mkdirSync(input);
  writeFileSync(join(input, 'pr.md'), '# PR'); writeFileSync(join(input, 'diff.patch'), '+x\n');
  writeFileSync(join(data, 'd.md'), '1. a.go:1 something');
  const id = execFileSync('node', [join(here, 'relay.mjs'), 'draft', '--target', 'acme/api#9', '--file', join(data, 'd.md'), '--input', input], { env, encoding: 'utf8' }).trim();
  const out = join(data, 'regress');
  const r = node('add-regression.mjs', '--draft', id, '--check', 'The retry loop has no cap', '--out', out);
  assert.equal(r.status, 0, r.stderr);
  const d = join(out, `reg-${id}`);
  assert.equal(JSON.parse(readFileSync(join(d, 'meta.json'), 'utf8')).regression, true);
  assert.equal(JSON.parse(readFileSync(join(d, 'reference/checklist.json'), 'utf8')).items[0].id, 'k1');
  assert.ok(existsSync(join(d, 'input/diff.patch')));
  assert.notEqual(node('add-regression.mjs', '--draft', id, '--check', 'again', '--out', out).status, 0); // add-only
  assert.notEqual(node('add-regression.mjs', '--draft', 'd-missing', '--check', 'x', '--out', out).status, 0);
  // compare picks it up first and remembers which dir it came from
  const hold = join(data, 'holdout'); mkdirSync(join(hold, 'pr-1'), { recursive: true });
  const sel = selectFixtures([hold, out], ['team-review']);
  assert.equal(sel[0].regression, true);
  assert.equal(sel[0].dir, out);
  assert.equal(sel[1].dir, hold);
});
