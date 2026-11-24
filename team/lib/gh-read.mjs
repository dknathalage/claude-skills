// Read-only GitHub access. The only way team tools talk to GitHub.
// Every call is a GET through `gh api`; anything that could write is refused before it runs.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const PATH_RE = /^\/?repos\/[\w.-]+\/[\w.-]+\/[\w./?&=%:@,{}+-]*$/;
const ACCEPT = { json: 'application/vnd.github+json', diff: 'application/vnd.github.diff' };

// True only for `api <repos/... path> [-H "Accept: …"]`: no method flag, no body, no other header.
export function isReadOnlyArgs(args) {
  if (args[0] !== 'api' || !PATH_RE.test(args[1] || '')) return false;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '-H' && /^Accept: application\/vnd\.github(\.\w+|\+json)$/.test(args[i + 1] || '')) { i++; continue; }
    return false;
  }
  return true;
}

async function get(path, kind = 'json') {
  const args = ['api', path, '-H', `Accept: ${ACCEPT[kind]}`];
  if (!isReadOnlyArgs(args)) throw new Error(`refused: not a read-only GitHub request: ${path}`);
  const { stdout } = await run(process.env.GH_BIN || 'gh', args, { maxBuffer: 256 * 1024 * 1024 });
  return kind === 'diff' ? stdout : JSON.parse(stdout);
}

export const ghJson = path => get(path, 'json');
export const ghDiff = path => get(path, 'diff');

// Own paging (per_page=100) so it does not depend on the gh version's --paginate output shape.
export async function ghPages(path, { maxPages = 20 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const items = await ghJson(`${path}${sep}per_page=100&page=${page}`);
    if (!Array.isArray(items)) return items;
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}
