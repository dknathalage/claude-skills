// Pure helpers: turn raw GitHub review data into the shapes the rest of team/ uses.
const BOTS = /\[bot\]$|^(dependabot|renovate|github-actions|codecov|sonarcloud|copilot)/i;

export const isBot = u => !u || u.type === 'Bot' || BOTS.test(u.login || '');
export const jiraKeys = (...texts) => [...new Set(texts.join('\n').match(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/g) || [])];

// Comments a human reviewer (not the author, not a bot) wrote.
export function reviewerComments({ inline = [], reviews = [], issue = [] }, author) {
  const keep = u => !isBot(u) && u.login !== author;
  const out = [];
  for (const c of inline) {
    if (!keep(c.user)) continue;
    out.push({ id: `i${c.id}`, kind: 'inline', author: c.user.login, path: c.path || null, line: c.line ?? c.original_line ?? null,
      commit: c.original_commit_id || c.commit_id || null, body: (c.body || '').trim(), at: c.created_at, reply_to: c.in_reply_to_id ? `i${c.in_reply_to_id}` : null });
  }
  for (const r of reviews) {
    if (!keep(r.user) || !(r.body || '').trim()) continue;
    out.push({ id: `r${r.id}`, kind: 'review', author: r.user.login, path: null, line: null, commit: r.commit_id || null, body: r.body.trim(), at: r.submitted_at, state: r.state, reply_to: null });
  }
  for (const c of issue) {
    if (!keep(c.user)) continue;
    out.push({ id: `c${c.id}`, kind: 'issue', author: c.user.login, path: null, line: null, commit: null, body: (c.body || '').trim(), at: c.created_at, reply_to: null });
  }
  return out.filter(c => c.body).sort((a, b) => a.at.localeCompare(b.at));
}

// The commit the first human review was written against, or null if nobody reviewed.
export function firstReviewCommit(comments) {
  const first = comments.find(c => c.kind !== 'issue' && c.commit);
  return first ? first.commit : null;
}

// Round-one comments: written against that first-reviewed commit, so they can apply to the frozen diff.
export const roundOne = (comments, commit) => comments.filter(c => c.kind !== 'issue' && c.commit === commit && c.reply_to === null);
