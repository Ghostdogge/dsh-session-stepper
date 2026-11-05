// Needs-queue selection: priority order, recency tie-break, wraparound, filtering.
//
// Runs the real client.js inside a VM with a mocked Cordis context, so the shipped code
// is what gets exercised. Exits non-zero on the first failed assertion.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

let spec
const sandbox = { window: { __ModuleLoader__: { load: (s) => { spec = s } } }, console, queueMicrotask, Date }
vm.createContext(sandbox)
vm.runInContext(source, sandbox)
const mod = spec.factory(() => ({}))

const now = Date.now()
const minutesAgo = (m) => now - m * 60000

function row({
  running = false,
  updatedAt = minutesAgo(600),
  questions = 0,
  inbox = 0,
  blank = false,
  view = false,
} = {}) {
  return {
    blank,
    running,
    updatedAt,
    retainedBy: { mainView: view ? 1 : 0 },
    projectionValues: {
      userQuestions: { active: Array.from({ length: questions }, (_, i) => ({ i })), settled: [] },
      inbox: {
        'next-turn': Array.from({ length: inbox }, (_, i) => ({ i })),
        'next-step': [],
      },
    },
  }
}

/**
 * Press one command and report where it goes.
 * @returns {'blocked'|string} target session id, or 'blocked'.
 */
function press(ids, byId, direction, archived = []) {
  const opened = []
  const commands = []
  const ctx = {
    get(name) {
      if (name === 'sessions') return { list: { getSnapshot: () => ({ ids, byId }) } }
      if (name === 'workspaces') return { list: { getSnapshot: () => ({ archivedSessionIds: archived }) } }
      if (name === 'uiWorkspace') return { openSession: (id) => opened.push(id) }
      return undefined
    },
    effect(fn) { fn() },
    shortcuts: { register: (cmd) => { commands.push(cmd); return () => {} } },
  }
  mod.apply(ctx)
  const id = `dsh-session-stepper.${direction}`
  const command = commands.find((c) => c.id === id)
  assert.ok(command, `command ${id} was not registered`)
  const verdict = command.resolve()
  if (verdict.status !== 'handled') return 'blocked'
  verdict.run()
  return opened[0]
}

let passed = 0
function check(label, actual, expected) {
  assert.equal(actual, expected, `${label}: got ${actual}, want ${expected}`)
  passed += 1
  console.log(`  ok  ${label}`)
}

// queue: q(question) > i(inbox) > r(running) > recent(<15m); idle not in queue
const make = (overrides = {}) => ({
  ids: ['q', 'i', 'r', 'recent', 'idle'],
  byId: {
    q: row({ questions: 1, view: true }),
    i: row({ inbox: 2 }),
    r: row({ running: true }),
    recent: row({ updatedAt: minutesAgo(3) }),
    idle: row({ updatedAt: minutesAgo(120) }),
    ...overrides,
  },
})

console.log('needs-queue')

const base = make()
check('next from question -> inbox', press(base.ids, base.byId, 'next'), 'i')
check('prev from question wraps -> recent', press(base.ids, base.byId, 'prev'), 'recent')

const atInbox = make({ q: row({ questions: 1 }), i: row({ inbox: 2, view: true }) })
check('next from inbox -> running', press(atInbox.ids, atInbox.byId, 'next'), 'r')
check('prev from inbox -> question', press(atInbox.ids, atInbox.byId, 'prev'), 'q')

const atIdle = make({ q: row({ questions: 1 }), idle: row({ updatedAt: minutesAgo(120), view: true }) })
check('outside queue -> next enters head', press(atIdle.ids, atIdle.byId, 'next'), 'q')
check('outside queue -> prev enters tail', press(atIdle.ids, atIdle.byId, 'prev'), 'recent')

const quiet = { ids: ['a'], byId: { a: row({ updatedAt: minutesAgo(120), view: true }) } }
check('empty queue blocks', press(quiet.ids, quiet.byId, 'next'), 'blocked')

const onlySelf = { ids: ['a', 'b'], byId: { a: row({ running: true, view: true }), b: row({ updatedAt: minutesAgo(300) }) } }
check('queue of only current blocks', press(onlySelf.ids, onlySelf.byId, 'next'), 'blocked')

const blanks = make({ q: row({ questions: 2, blank: true }), i: row({ inbox: 1, view: true }) })
check('blank row never counts', press(blanks.ids, blanks.byId, 'next'), 'r')

const archived = make({ q: row({ questions: 3 }) })
check('archived row never counts', press(archived.ids, archived.byId, 'next', ['q']), 'i')

console.log(`\n${passed} checks passed`)
