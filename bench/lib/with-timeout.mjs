#!/usr/bin/env node
// Run a command with a wall-clock limit, capturing output to files. Portable (no GNU timeout needed).
//   node with-timeout.mjs <seconds> <stdout-file> <stderr-file> -- cmd args…     exits 124 on timeout
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

const [secs, outF, errF, dash, cmd, ...args] = process.argv.slice(2);
if (dash !== '--' || !cmd) { console.error('usage: with-timeout.mjs SECONDS OUT ERR -- CMD ARGS'); process.exit(64); }
const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
child.stdout.pipe(createWriteStream(outF));
child.stderr.pipe(createWriteStream(errF));
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }, 5000).unref();
}, Number(secs) * 1000);
child.on('exit', code => { clearTimeout(timer); process.exit(timedOut ? 124 : (code ?? 1)); });
child.on('error', e => { console.error(e.message); process.exit(127); });
