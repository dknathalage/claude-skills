#!/usr/bin/env node
// PreToolUse hook: when CLAUDE_SKILLS_NO_POST=1, refuse anything that writes to GitHub, Jira or Slack (and git push).
// Opt-in, so personal sessions are unaffected. Set the variable in the shell that launches team sessions.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GH_WRITE = /\bgh\s+(pr|issue|release|repo|label|workflow|run|gist)\s+(comment|review|edit|close|reopen|merge|create|ready|lock|unlock|delete|transfer|rename|fork|sync|rerun|cancel|disable|enable)\b/;
const GH_API = /\bgh\s+api\b/;
const API_WRITE_FLAG = /(?:^|\s)(-X|--method)(?:\s+|=)(?!GET\b)\S+|(?:^|\s)(-f|-F|--field|--raw-field|--input)(?:\s|=)/;
const CURL_WRITE = /\b(curl|wget|http|https)\b[^\n|;]*?(?:-X\s*(POST|PUT|PATCH|DELETE)|--request\s+(POST|PUT|PATCH|DELETE)|--data\S*|(?:^|\s)-d\s|(?:^|\s)-F\s|--post-data|--upload-file|(?:^|\s)-T\s)/i;
const CURL_HOST = /slack\.com|atlassian\.net|atlassian\.com|api\.github\.com|github\.com/i;
const WRITE_VERBS = {
  slack: ['send', 'post', 'reply', 'schedule', 'update', 'delete', 'react', 'create', 'archive', 'invite', 'upload', 'set', 'edit'],
  jira: ['comment', 'create', 'edit', 'update', 'transition', 'delete', 'add', 'assign', 'link', 'worklog'],
  github: ['create', 'add', 'update', 'delete', 'merge', 'push', 'submit', 'comment', 'reply', 'resolve', 'fork', 'dismiss', 'edit'],
};
const SERVER = { slack: /slack/i, jira: /jira|atlassian|confluence/i, github: /github/i };

export function denies(toolName, input = {}) {
  if (toolName === 'Bash') {
    const c = String(input.command || '');
    if (/\bgit\s+push\b/.test(c)) return 'git push is off limits in no-post mode';
    if (GH_WRITE.test(c)) return 'gh write commands are off limits in no-post mode';
    if (GH_API.test(c) && API_WRITE_FLAG.test(c)) return 'gh api with a method or body is off limits in no-post mode';
    if (CURL_WRITE.test(c) && CURL_HOST.test(c)) return 'writing to GitHub, Jira or Slack over HTTP is off limits in no-post mode';
    return null;
  }
  if (toolName?.startsWith('mcp__')) {
    const tokens = toolName.split('__').slice(2).join('_').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().split(/_+/);
    for (const [name, re] of Object.entries(SERVER)) {
      if (re.test(toolName) && tokens.some(t => WRITE_VERBS[name].includes(t))) return `${toolName} writes to a team system and is off limits in no-post mode`;
    }
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.env.CLAUDE_SKILLS_NO_POST === '1') {
  let ev = {};
  try { ev = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
  const why = denies(ev.tool_name, ev.tool_input);
  if (why) { console.error(`Blocked: ${why}. Draft the text for the person to post themselves (claude-skills:relay).`); process.exit(2); }
}
