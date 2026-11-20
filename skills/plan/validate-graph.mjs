#!/usr/bin/env node
// Validate a claude-skills task graph and compute its waves.
//   node validate-graph.mjs <graph.json>
//   exit 0 → {"ok":true,"waves":[["T1","T2"],["T3"]]}
//   exit 1 → {"ok":false,"errors":["…"]}
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REQUIRED = ['id', 'owns', 'instructions', 'verify'];

export function validate(graph) {
  const errors = [];
  const tasks = Array.isArray(graph?.tasks) ? graph.tasks : [];
  if (!tasks.length) errors.push('graph has no tasks');

  const byId = new Map();
  for (const t of tasks) {
    for (const f of REQUIRED) {
      const v = t?.[f];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
        errors.push(`${t?.id ?? '(no id)'}: missing ${f}`);
      }
    }
    if (t?.id !== undefined) {
      if (byId.has(t.id)) errors.push(`duplicate task id ${t.id}`);
      byId.set(t.id, t);
    }
  }

  const deps = id => (byId.get(id)?.depends_on || []);
  for (const t of tasks) {
    for (const d of t.depends_on || []) {
      if (!byId.has(d)) errors.push(`"${d}" not found (depended on by ${t.id})`);
    }
  }
  if (errors.length) return { ok: false, errors };

  // Cycle detection (DFS) — report the cycle's ids in order.
  const state = new Map(); // 1 = visiting, 2 = done
  const stack = [];
  const visit = id => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return stack.slice(stack.indexOf(id)).concat(id);
    state.set(id, 1); stack.push(id);
    for (const d of deps(id)) { const c = visit(d); if (c) return c; }
    stack.pop(); state.set(id, 2);
    return null;
  };
  for (const id of byId.keys()) {
    const cycle = visit(id);
    if (cycle) return { ok: false, errors: [`dependency cycle: ${cycle.reverse().join(' -> ')}`] };
  }

  // Waves = longest-path levels.
  const level = new Map();
  const lvl = id => {
    if (level.has(id)) return level.get(id);
    const l = Math.max(-1, ...deps(id).map(lvl)) + 1;
    level.set(id, l);
    return l;
  };
  const waves = [];
  for (const t of tasks) { const l = lvl(t.id); (waves[l] ||= []).push(t.id); }

  // Ancestors, to know which pairs may run at the same time.
  const anc = new Map();
  const ancestors = id => {
    if (anc.has(id)) return anc.get(id);
    const s = new Set();
    for (const d of deps(id)) { s.add(d); for (const a of ancestors(d)) s.add(a); }
    anc.set(id, s);
    return s;
  };
  const ordered = (a, b) => ancestors(a).has(b) || ancestors(b).has(a);

  const ids = tasks.map(t => t.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [ids[i], ids[j]];
      if (ordered(a, b)) continue;
      const bOwns = new Set(byId.get(b).owns);
      for (const f of byId.get(a).owns) {
        if (bOwns.has(f)) errors.push(`${f} owned by ${a} and ${b}, which can run at the same time`);
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, waves };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) { console.error('usage: validate-graph.mjs <graph.json>'); process.exit(2); }
  let graph;
  try { graph = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { console.log(JSON.stringify({ ok: false, errors: [`cannot read ${path}: ${e.message}`] })); process.exit(1); }
  const r = validate(graph);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
