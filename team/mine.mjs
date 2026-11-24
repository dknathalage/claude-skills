#!/usr/bin/env node
// Mine merged PRs and their human review feedback into local files. Read-only: GitHub GET requests only.
//   node team/mine.mjs --repo owner/name [--repo …] [--since 2026-01-01] [--limit 200] [--prs 12,15] [--out DIR] [--refresh]
// Writes <out>/<owner>__<repo>/<number>/{pr.json, comments.json, diff.patch}. Default out: $TEAM_DATA/mined
// ($TEAM_DATA defaults to ~/.cache/claude-skills-team). Mined data is company data: it stays outside this repo.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ghJson, ghPages, ghDiff } from './lib/gh-read.mjs';
import { reviewerComments, firstReviewCommit, jiraKeys, isBot } from './lib/pr-shape.mjs';
import { fileURLToPath } from 'node:url';

export const dataDir = () => process.env.TEAM_DATA || join(homedir(), '.cache', 'claude-skills-team');

export async function minePr(repo, number, outRoot, { refresh = false } = {}) {
  const dir = join(outRoot, repo.replace('/', '__'), String(number));
  if (existsSync(join(dir, 'pr.json')) && !refresh) return { number, status: 'cached' };
  const base = `repos/${repo}`;
  const pr = await ghJson(`${base}/pulls/${number}`);
  if (!pr.merged_at) return { number, status: 'skipped: not merged' };
  const [inline, reviews, issue] = await Promise.all([
    ghPages(`${base}/pulls/${number}/comments`), ghPages(`${base}/pulls/${number}/reviews`), ghPages(`${base}/issues/${number}/comments`),
  ]);
  const author = pr.user?.login;
  const comments = reviewerComments({ inline, reviews, issue }, author);
  const commit = firstReviewCommit(comments);
  if (!commit) return { number, status: 'skipped: no human review' };
  const diff = await ghDiff(`${base}/compare/${pr.base.sha}...${commit}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pr.json'), JSON.stringify({
    repo, number, title: pr.title, body: pr.body || '', author, labels: (pr.labels || []).map(l => l.name),
    base_sha: pr.base.sha, review_commit: commit, created_at: pr.created_at, merged_at: pr.merged_at,
    jira: jiraKeys(pr.title, pr.body || '', pr.head?.ref || ''),
  }, null, 2));
  writeFileSync(join(dir, 'comments.json'), JSON.stringify(comments, null, 2));
  writeFileSync(join(dir, 'diff.patch'), diff);
  return { number, status: 'mined', comments: comments.length };
}

export async function listMerged(repo, { since, limit = 200, prs } = {}) {
  if (prs?.length) return prs;
  const found = [];
  for (let page = 1; found.length < limit && page <= 30; page++) {
    const batch = await ghJson(`repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);
    for (const p of batch) {
      if (!p.merged_at || isBot(p.user)) continue;
      if (since && p.merged_at < since) continue;
      found.push(p.number);
    }
    if (batch.length < 100) break;
  }
  return found.slice(0, limit);
}

const arg = (a, k) => a.flatMap((x, i) => (x === k ? [a[i + 1]] : []));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const repos = arg(a, '--repo');
  if (!repos.length) { console.error('usage: mine.mjs --repo owner/name [--since DATE] [--limit N] [--prs 1,2] [--out DIR] [--refresh]'); process.exit(64); }
  const out = arg(a, '--out')[0] || join(dataDir(), 'mined');
  const prs = (arg(a, '--prs')[0] || '').split(',').filter(Boolean).map(Number);
  let mined = 0;
  for (const repo of repos) {
    const numbers = await listMerged(repo, { since: arg(a, '--since')[0], limit: Number(arg(a, '--limit')[0] || 200), prs });
    console.error(`${repo}: ${numbers.length} merged PRs to look at`);
    for (const n of numbers) {
      try {
        const r = await minePr(repo, n, out, { refresh: a.includes('--refresh') });
        if (r.status === 'mined') mined++;
        console.error(`  #${n} ${r.status}`);
      } catch (e) { console.error(`  #${n} failed: ${e.message.split('\n')[0]}`); }
    }
  }
  console.log(`mined ${mined} new PR(s) into ${out}`);
}
