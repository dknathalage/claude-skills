export const meta = {
  name: 'claude-skills-swarm',
  description: 'Build a claude-skills task graph with parallel Haiku workers, then integrate and review on the session model',
  whenToUse: 'Invoked by the claude-skills:build skill with a validated task graph',
  phases: [
    { title: 'Build', detail: 'Haiku implement + check per task, started as soon as its dependencies pass', model: 'haiku' },
    { title: 'Integrate', detail: 'one Haiku agent merges finished tasks and runs verify_all', model: 'haiku' },
    { title: 'Review', detail: 'whole-branch review on the session model' },
  ],
}

// args: { graph, waves, topic, mode: { isolation: 'worktree'|'shared', check: bool, serial: bool }, tdd? }
const graph = args.graph
const waves = args.waves
const topic = args.topic || 'feature'
const mode = args.mode || {}
const isolation = mode.isolation === 'shared' ? 'shared' : 'worktree'
const doCheck = mode.check !== false
const serial = mode.serial === true
const MAX_FIX_ROUNDS = 2
// Timeouts (minutes). A workflow cannot cancel an agent, so on timeout the script stops
// waiting, records the task as stuck, and moves on. Defaults are generous; they catch hangs.
const TIMEOUTS = { implement_min: 20, check_min: 10, integrate_min: 20, review_min: 20, ...(mode.timeouts || {}) }
const DEADLINE_MIN = typeof mode.deadline_min === 'number' ? mode.deadline_min : 120
const timers = new Set()
const TIMED_OUT = { timed_out: true }
function withTimeout(promise, minutes) {
  let handle
  const timer = new Promise(resolve => { handle = setTimeout(() => resolve(TIMED_OUT), minutes * 60000); timers.add(handle) })
  return Promise.race([promise, timer]).finally(() => { clearTimeout(handle); timers.delete(handle) })
}
let deadlineHit = false
const deadlineHandle = setTimeout(() => { deadlineHit = true; log(`build deadline of ${DEADLINE_MIN} min reached: no new tasks will start`) }, DEADLINE_MIN * 60000)
timers.add(deadlineHandle)
const WORKER = { model: 'haiku', effort: 'low' }
const FEATURE = `build/${topic}`
const branchOf = id => `swarm/${topic}/${id}`  // never nested under FEATURE: git cannot hold build/x and build/x/T1

const byId = new Map(graph.tasks.map(t => [t.id, t]))
const order = waves.flat()
const allOwns = graph.tasks.map(t => `${t.id}: ${t.owns.join(', ')}`).join('\n')

const TDD = args.tdd || [
  'Work test-first: write or update the test for the behaviour, run it and watch it fail, then write the minimal code to make it pass.',
  'Run the task verify command and read its output before reporting. Never report verify_passed=true without having run it.',
  'Do not change code or tests outside your owned files to make things pass.',
].join('\n')

const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'blocked'] },
    files_changed: { type: 'array', items: { type: 'string' } },
    verify_passed: { type: 'boolean' },
    verify_tail: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['status', 'files_changed', 'verify_passed', 'verify_tail', 'notes'],
}
const CHECK_SCHEMA = {
  type: 'object',
  properties: { pass: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } } },
  required: ['pass', 'problems'],
}
const INTEGRATE_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    conflicts: { type: 'array', items: { type: 'string' } },
    verify_all_passed: { type: 'boolean' },
    verify_all_tail: { type: 'string' },
  },
  required: ['ok', 'conflicts', 'verify_all_passed', 'verify_all_tail'],
}
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
          file: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['severity', 'file', 'summary'],
      },
    },
  },
  required: ['findings'],
}

function isolationRules(t) {
  if (isolation === 'worktree') {
    const merges = (t.depends_on || []).map(d => `git merge --no-edit ${branchOf(d)}`)
    return [
      'You are in your own git worktree.',
      `First: git checkout -b ${branchOf(t.id)}`,
      ...(merges.length ? ['Then bring in the work you depend on:', ...merges] : []),
      `When verify passes, commit only your owned files on ${branchOf(t.id)} with message "${t.id}: ${t.title}".`,
    ].join('\n')
  }
  return [
    'You share the working folder with other workers editing other files at the same time.',
    'Do not commit and do not run git commands that change state (no add, commit, stash, checkout, reset).',
    `Build into your own output folder so builds do not collide: pass -o .build/${t.id} (or --artifacts-path .build/${t.id}) to every dotnet build/test you run.`,
  ].join('\n')
}

function implementPrompt(t, problems, round) {
  return [
    `You are implementing task ${t.id} of a larger plan. Follow the instructions exactly; do not make design decisions beyond them.`,
    `Goal of the whole plan: ${graph.goal}`,
    `Spec: ${graph.spec}`,
    '',
    `## Task ${t.id}: ${t.title}`,
    t.instructions,
    '',
    `Files you own (the ONLY files you may create or edit): ${t.owns.join(', ')}`,
    `Files you may read: ${(t.reads || []).join(', ') || '(any, read-only)'}`,
    `Verify command: ${t.verify}`,
    `Done when: ${(t.done_when || []).join('; ')}`,
    '',
    '## Rules',
    TDD,
    isolationRules(t),
    ...(problems && problems.length
      ? ['', `## Fix round ${round}: a checker rejected your previous attempt`, ...problems.map(p => `- ${p}`), 'Fix these problems. Keep what already works.']
      : []),
    '',
    'If you cannot do the task as written, set status "blocked" and say why in notes. Report the files you changed and the last lines of the verify output.',
  ].join('\n')
}

function checkPrompt(t, impl) {
  const where = isolation === 'worktree'
    ? [
        'You are in your own fresh git worktree inside the project. Do not create other worktrees or leave the project folder.',
        `Check out the work: git checkout --detach ${branchOf(t.id)}`,
        `List the files this task changed: git diff --name-only ${graph.base_branch}...HEAD`,
        'Do not commit anything.',
      ].join('\n')
    : [
        'The work is uncommitted in the shared working folder, alongside other workers. Ownership of every task:',
        allOwns,
        `The worker reported changing: ${(impl.files_changed || []).join(', ') || '(nothing)'}`,
        `Run dotnet with -o .build/${t.id}-check so you do not collide with other builds. Do not commit or change git state.`,
      ].join('\n')
  return [
    `You are checking task ${t.id}. You did not write it. Be strict but only about what the task asks.`,
    '',
    `## Task ${t.id}: ${t.title}`,
    t.instructions,
    '',
    `Owned files: ${t.owns.join(', ')}`,
    `Verify command: ${t.verify}`,
    `Done when: ${(t.done_when || []).join('; ')}`,
    '',
    where,
    '',
    'Pass only if ALL hold:',
    '1. You ran the verify command yourself and it passed.',
    '2. No file outside the owned files was created or edited for this task.',
    '3. The instructions were followed and every done-when item holds.',
    'For each failure add one concrete problem a worker can act on (file, what is wrong, what is expected).',
  ].join('\n')
}

function integratePrompt(passed) {
  const steps = isolation === 'worktree'
    ? [
        `In the main checkout, make sure you are on ${FEATURE} (create it from ${graph.base_branch} if it does not exist).`,
        'Merge these task branches in this order, one at a time:',
        ...passed.map(id => `- git merge --no-edit ${branchOf(id)}`),
        'If a merge conflicts, resolve it only if the resolution is obvious from both sides; otherwise abort that merge and list it as a conflict.',
      ]
    : [
        `In the main checkout, make sure you are on ${FEATURE} (create it from ${graph.base_branch} if it does not exist).`,
        'The finished tasks left uncommitted changes. Commit them one task at a time, in this order, staging only that task\'s owned files:',
        ...passed.map(id => `- ${id}: git add ${byId.get(id).owns.join(' ')} && git commit -m "${id}: ${byId.get(id).title}"`),
        'Remove the .build/ folder afterwards (it is gitignored).',
      ]
  return [
    'You are integrating finished tasks into the feature branch.',
    ...steps,
    `Then run the full verify command: ${graph.verify_all}`,
    'Report whether everything integrated, any conflicts, and the last lines of the verify output.',
  ].join('\n')
}

function reviewPrompt(summary) {
  return [
    `Review the whole change on branch ${FEATURE} against the spec ${graph.spec}.`,
    `Diff: git diff ${graph.base_branch}...${FEATURE}`,
    `Goal: ${graph.goal}`,
    '',
    'Task outcomes:',
    ...summary.map(t => `- ${t.id} ${t.title}: ${t.status}`),
    '',
    'Look for: spec requirements that are missing or wrong, bugs, missing tests for behaviour the spec names, and code that would not pass a careful senior review.',
    'Grade each finding critical (wrong or missing behaviour), important (real defect or gap a user would hit), or minor (polish). Do not report style nits.',
  ].join('\n')
}

// ---- run ----
const results = new Map()
const done = new Map() // id -> promise of result

async function runTask(id) {
  const t = byId.get(id)
  const blocked = (t.depends_on || []).filter(d => results.get(d)?.status !== 'pass')
  if (blocked.length) {
    const r = { id, title: t.title, status: 'skipped', fix_rounds: 0, files_changed: [], reason: `depends on ${blocked.join(', ')}` }
    results.set(id, r)
    return r
  }
  if (deadlineHit) {
    const r = { id, title: t.title, status: 'skipped', fix_rounds: 0, files_changed: [], reason: `build deadline of ${DEADLINE_MIN} min reached` }
    results.set(id, r)
    return r
  }
  let problems = []
  let impl = null
  let round = 0
  let timedOut = false
  for (; round <= MAX_FIX_ROUNDS; round++) {
    impl = await withTimeout(agent(implementPrompt(t, problems, round), {
      ...WORKER, label: `implement:${id}`, phase: 'Build', schema: IMPLEMENT_SCHEMA,
      ...(isolation === 'worktree' ? { isolation: 'worktree' } : {}),
    }), TIMEOUTS.implement_min)
    if (impl === TIMED_OUT) { timedOut = true; problems = [`implement timed out after ${TIMEOUTS.implement_min} min: the task is probably too big for one worker; split it`]; impl = null; break }
    if (!impl) { problems = ['the worker crashed or returned nothing; start again']; continue }
    if (impl.status === 'blocked') { problems = [`worker reported blocked: ${impl.notes}`]; continue }
    if (doCheck) {
      const chk = await withTimeout(agent(checkPrompt(t, impl), {
        ...WORKER, label: `check:${id}`, phase: 'Build', schema: CHECK_SCHEMA,
        ...(isolation === 'worktree' ? { isolation: 'worktree' } : {}),
      }), TIMEOUTS.check_min)
      if (chk === TIMED_OUT) { timedOut = true; problems = [`check timed out after ${TIMEOUTS.check_min} min`]; break }
      if (chk && chk.pass) break
      problems = chk ? chk.problems : ['the checker crashed; re-run verify and report honestly']
    } else {
      if (impl.verify_passed) break
      problems = [`verify did not pass:\n${impl.verify_tail}`]
    }
  }
  const pass = !timedOut && round <= MAX_FIX_ROUNDS
  const r = { id, title: t.title, status: pass ? 'pass' : 'stuck', fix_rounds: Math.min(round, MAX_FIX_ROUNDS), files_changed: impl ? impl.files_changed : [], problems: pass ? [] : problems, ...(timedOut ? { timed_out: true } : {}) }
  results.set(id, r)
  log(`${id} ${r.status}${r.fix_rounds ? ` after ${r.fix_rounds} fix round(s)` : ''}`)
  return r
}

phase('Build')
if (serial) {
  for (const id of order) await runTask(id)
} else {
  // Start each task as soon as its dependencies have finished (no wave barrier).
  const start = id => {
    if (!done.has(id)) {
      done.set(id, Promise.all((byId.get(id).depends_on || []).map(start)).then(() => runTask(id)))
    }
    return done.get(id)
  }
  await parallel(order.map(id => () => start(id)))
}

const summary = order.map(id => results.get(id))
const passed = summary.filter(t => t.status === 'pass').map(t => t.id)

phase('Integrate')
let integrate = passed.length
  ? await withTimeout(agent(integratePrompt(passed), { ...WORKER, label: 'integrate', phase: 'Integrate', schema: INTEGRATE_SCHEMA }), TIMEOUTS.integrate_min)
  : { ok: false, conflicts: ['no task passed'], verify_all_passed: false, verify_all_tail: '' }
if (integrate === TIMED_OUT) integrate = { ok: false, conflicts: [`integrate timed out after ${TIMEOUTS.integrate_min} min`], verify_all_passed: false, verify_all_tail: '', timed_out: true }
if (!integrate) integrate = { ok: false, conflicts: ['integrate agent returned nothing'], verify_all_passed: false, verify_all_tail: '' }

phase('Review')
let review = passed.length
  ? await withTimeout(agent(reviewPrompt(summary), { label: 'review', phase: 'Review', schema: REVIEW_SCHEMA }), TIMEOUTS.review_min)
  : { findings: [] }
if (review === TIMED_OUT) review = { findings: [], timed_out: true }
if (!review) review = { findings: [] }

for (const h of timers) clearTimeout(h)
timers.clear()

const count = s => summary.filter(t => t.status === s).length
return {
  branch: FEATURE,
  tasks: summary,
  integrate,
  review,
  totals: { tasks: summary.length, passed: count('pass'), stuck: count('stuck'), skipped: count('skipped') },
  deadline_hit: deadlineHit,
}
