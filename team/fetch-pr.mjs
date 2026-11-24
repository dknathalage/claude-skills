#!/usr/bin/env node
// Fetch one live PR in the same shape as a fixture's input/, for the relay workflow. Read-only.
//   node team/fetch-pr.mjs owner/name#123 --out DIR   → DIR/pr.md and DIR/diff.patch
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ghJson, ghDiff } from './lib/gh-read.mjs';
import { jiraKeys } from './lib/pr-shape.mjs';

export const prMarkdown = pr => [
  `# ${pr.title}`, '', `Author: ${pr.author}`, pr.labels?.length ? `Labels: ${pr.labels.join(', ')}` : '',
  pr.jira?.length ? `Jira: ${pr.jira.join(', ')}` : '', '', pr.body || '(no description)', '',
].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [ref, , out] = process.argv.slice(2);
  const m = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(ref || '');
  if (!m || !out) { console.error('usage: fetch-pr.mjs owner/name#123 --out DIR'); process.exit(64); }
  const [, repo, n] = m;
  const pr = await ghJson(`repos/${repo}/pulls/${n}`);
  const diff = await ghDiff(`repos/${repo}/pulls/${n}`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'pr.md'), prMarkdown({ title: pr.title, author: pr.user?.login, labels: (pr.labels || []).map(l => l.name), jira: jiraKeys(pr.title, pr.body || '', pr.head?.ref || ''), body: pr.body }));
  writeFileSync(join(out, 'diff.patch'), diff);
  console.log(`wrote ${out}/pr.md and diff.patch`);
}
