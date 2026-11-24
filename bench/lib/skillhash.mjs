#!/usr/bin/env node
// Content hash of a plugin tree, so scores cache by what the skills say, not by commit.
//   node bench/lib/skillhash.mjs <plugin-dir>  → {"plugin": "<sha256>", "skills": {"<name>": "<sha256>"}}
// Hashes skills/<name>/** per skill and hooks/**. Ignores plugin.json (its version bumps every change),
// docs, bench and git metadata, so amends, rebases and message-only commits keep their cache.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const files = dir => {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else out.push(p);
  }
  return out;
};

const hashTree = dir => {
  const h = createHash('sha256');
  for (const f of files(dir)) {
    h.update(relative(dir, f) + '\0');
    h.update(readFileSync(f));
    h.update('\0');
  }
  return h.digest('hex');
};

export function skillHashes(pluginDir) {
  const skillsDir = join(pluginDir, 'skills');
  const skills = {};
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir).sort()) {
      if (statSync(join(skillsDir, name)).isDirectory()) skills[name] = hashTree(join(skillsDir, name));
    }
  }
  const top = createHash('sha256');
  for (const [n, h] of Object.entries(skills)) top.update(`${n}:${h}\n`);
  top.update(`hooks:${hashTree(join(pluginDir, 'hooks'))}\n`);
  return { plugin: top.digest('hex'), skills };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(skillHashes(process.argv[2])));
}
