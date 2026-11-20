// Run a Claude workflow script under node with a fake agent().
// Mirrors the runtime's hooks: agent, pipeline, parallel, phase, log, args.
import { readFileSync } from 'node:fs';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export async function runWorkflow(path, args, fakeAgent) {
  const src = readFileSync(path, 'utf8').replace(/^export const meta/m, 'const meta');
  const calls = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, opts });
    return fakeAgent(prompt, opts);
  };
  const parallel = async thunks => Promise.all(thunks.map(t => Promise.resolve().then(t).catch(() => null)));
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let v = item;
    try { for (const s of stages) v = await s(v, item, i); return v; } catch { return null; }
  }));
  const logs = [];
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', src);
  const result = await fn(agent, parallel, pipeline, () => {}, m => logs.push(m), args, { total: null });
  return { result, calls, logs };
}
