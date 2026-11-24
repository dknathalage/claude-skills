#!/usr/bin/env node
// Check an improver change against bench/improver-allow.
//   git diff --name-status --no-renames <base> <head> | node bench/lib/guard.mjs bench/improver-allow
// Reads "<status>\t<path>" lines on stdin. Prints each violation and exits 1 if there are any.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const globToRe = g => new RegExp('^' + g.split('**').map(p => p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')).join('.*') + '$');

export function parseAllow(text) {
  const rules = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [mode, glob] = t.split(/\s+/);
    if (!['edit', 'add'].includes(mode) || !glob) throw new Error(`bad allow line: ${line}`);
    rules.push({ mode, re: globToRe(glob) });
  }
  return rules;
}

export function violations(changes, rules) {
  const bad = [];
  for (const { status, path } of changes) {
    const s = status[0];
    const ok = rules.some(r => r.re.test(path) && (r.mode === 'edit' || s === 'A'));
    if (!ok) bad.push(`${s} ${path}`);
  }
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rules = parseAllow(readFileSync(process.argv[2], 'utf8'));
  const input = readFileSync(0, 'utf8').split('\n').filter(Boolean).map(l => {
    const [status, ...rest] = l.split('\t');
    return { status, path: rest.join('\t') };
  });
  const bad = violations(input, rules);
  if (bad.length) {
    console.error('Improver change touches protected paths:\n' + bad.map(b => '  ' + b).join('\n'));
    process.exit(1);
  }
  console.log(`ok: ${input.length} changed path(s), all allowed`);
}
