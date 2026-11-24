#!/usr/bin/env node
// Relay log: what Claude drafted, what Don actually posted, and how people reacted. Local JSONL, never leaves the machine.
//   node team/relay.mjs draft --target owner/repo#12 --file draft.md [--kind pr-review|jira|slack]   → prints the draft id
//   node team/relay.mjs posted --id ID (--same | --file posted.txt)
//   node team/relay.mjs outcome --id ID --result accepted|rejected|ignored|discussed [--note "…"]
//   node team/relay.mjs feedback [--since-last | --since ISO]    → JSON of entries worth learning from
//   node team/relay.mjs mark-improved                            → move the "last improvement" mark to now
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dataDir } from './mine.mjs';
import { skillHashes } from '../bench/lib/skillhash.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const logPath = () => join(dataDir(), 'relay.jsonl');
const markPath = () => join(dataDir(), 'relay.improved-at');
export const RESULTS = ['accepted', 'rejected', 'ignored', 'discussed'];

const words = t => new Set(t.toLowerCase().match(/[a-z0-9_]+/g) || []);
// Word-set overlap, 1 = same words. edit_ratio = 1 - similarity.
export function similarity(a, b) {
  const x = words(a), y = words(b);
  if (!x.size && !y.size) return 1;
  let both = 0; for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

const read = () => (existsSync(logPath()) ? readFileSync(logPath(), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const append = e => { mkdirSync(dataDir(), { recursive: true }); appendFileSync(logPath(), JSON.stringify(e) + '\n'); };

export function join_(entries) {
  const byId = new Map();
  for (const e of entries) {
    if (e.type === 'draft') byId.set(e.id, { id: e.id, target: e.target, kind: e.kind, draft: e.text, skills_hash: e.skills_hash, at: e.at, outcomes: [] });
    else if (byId.has(e.draft_id)) {
      const d = byId.get(e.draft_id);
      if (e.type === 'posted') Object.assign(d, { posted: e.text, edit_ratio: 1 - similarity(d.draft, e.text), posted_at: e.at });
      if (e.type === 'outcome') d.outcomes.push({ result: e.result, note: e.note || '', at: e.at });
    }
  }
  return [...byId.values()];
}

// Worth learning from: Don changed the draft, it was rejected or discussed with a note, or it was dropped unposted.
export function signals(joined, { editThreshold = 0.1 } = {}) {
  return joined.filter(d =>
    (d.posted !== undefined && d.edit_ratio > editThreshold) ||
    d.outcomes.some(o => o.result === 'rejected' || (o.result === 'discussed' && o.note)) ||
    (d.posted === undefined && d.outcomes.some(o => o.result === 'ignored')));
}

const arg = (a, k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...a] = process.argv.slice(2);
  const now = new Date().toISOString();
  const fail = m => { console.error(m); process.exit(64); };
  if (cmd === 'draft') {
    const target = arg(a, '--target'), file = arg(a, '--file');
    if (!target || !file) fail('usage: relay.mjs draft --target owner/repo#12 --file draft.md [--kind K]');
    const id = `d-${now.slice(0, 10)}-${randomBytes(3).toString('hex')}`;
    append({ type: 'draft', id, target, kind: arg(a, '--kind') || 'pr-review', text: readFileSync(file, 'utf8'), skills_hash: skillHashes(ROOT).plugin.slice(0, 12), at: now });
    console.log(id);
  } else if (cmd === 'posted') {
    const id = arg(a, '--id'); const d = join_(read()).find(x => x.id === id);
    if (!d) fail(`no draft ${id}`);
    const text = a.includes('--same') ? d.draft : readFileSync(arg(a, '--file') || fail('need --same or --file'), 'utf8');
    append({ type: 'posted', draft_id: id, text, at: now });
    console.log(`recorded; edit ratio ${(1 - similarity(d.draft, text)).toFixed(2)}`);
  } else if (cmd === 'outcome') {
    const id = arg(a, '--id'), result = arg(a, '--result');
    if (!join_(read()).some(x => x.id === id)) fail(`no draft ${id}`);
    if (!RESULTS.includes(result)) fail(`--result must be one of ${RESULTS.join(', ')}`);
    append({ type: 'outcome', draft_id: id, result, note: arg(a, '--note') || '', at: now });
    console.log('recorded');
  } else if (cmd === 'feedback') {
    const since = a.includes('--since-last') ? (existsSync(markPath()) ? readFileSync(markPath(), 'utf8').trim() : '') : (arg(a, '--since') || '');
    const recent = join_(read()).filter(d => d.at >= since);
    console.log(JSON.stringify({ since: since || null, drafts: recent.length, signals: signals(recent) }, null, 2));
  } else if (cmd === 'mark-improved') {
    mkdirSync(dataDir(), { recursive: true }); writeFileSync(markPath(), now); console.log(`marked ${now}`);
  } else fail('usage: relay.mjs draft|posted|outcome|feedback|mark-improved');
}
