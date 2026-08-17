#!/usr/bin/env node
/**
 * Verify the ui-workspace worktree seam on a bundle WITHOUT writing to it.
 *
 * Applies `applyWorkspaceSeam` in memory, then:
 *   1. checks the static markers (signatures, pass-through, call site, rehome);
 *   2. EXECUTES the patched bundle through a stubbed `window.__ModuleLoader__`
 *      and asserts the factory registers `apply`/`inject` without throwing —
 *      this catches the class of bug where a bundle parses but crashes at
 *      runtime (e.g. an undeclared `worktreeWorkspaceOf` inside
 *      `groupByWorkspace`, which killed the whole sidebar);
 *   3. runs a behavioral test of the patched `groupByWorkspace`: worktree
 *      sessions are re-homed into their owning workspace group, true orphans
 *      land in Ungrouped, and nothing is lost.
 *
 *   node scripts/verify-seam.mjs [bundle-path]
 *
 * Exits non-zero on any failure. The bundle path defaults to the installed
 * profile copy.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { applyWorkspaceSeam } from './seam.mjs'

function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

function defaultBundle() {
  const candidates = [
    join(dshHome(), 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
    join(dshHome(), 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
  ]
  return candidates.find(existsSync)
}

const bundle = process.argv[2] ?? defaultBundle()
if (bundle === undefined || !existsSync(bundle)) {
  console.error('no workspace bundle found; pass a path: node scripts/verify-seam.mjs <bundle>')
  process.exit(1)
}

let failures = 0
const fail = (message) => {
  failures += 1
  console.error(`FAIL: ${message}`)
}

const code = readFileSync(bundle, 'utf8')
const result = applyWorkspaceSeam(code)
if (result.status === 'mismatch') {
  console.error(`FAIL: seam mismatch on ${bundle}:`)
  for (const anchor of result.missing) console.error('  - ' + anchor)
  process.exit(1)
}
const patched = result.code
console.log(`seam status on ${bundle}: ${result.status}`)

// 1. static markers
const markers = [
  ['WorkspaceBrowser signature declares the mapping',
    'searchResultLimit, useDirectoryFlow, renderSlot, worktreeWorkspaceOf, t }) {'],
  ['SessionTree destructure declares the mapping',
    'syncSessionOrderAccount, setSessionOrder, worktreeWorkspaceOf, t }) {'],
  ['WorkspaceBrowser passes the mapping to SessionTree',
    'setSessionOrder: actions.setSessionOrder,\n\t\t\t\t\t\t\tworktreeWorkspaceOf,\n\t\t\t\t\t\t\tarchivedSessionIds,'],
  ['groupByWorkspace signature declares the mapping',
    'function groupByWorkspace(list, workspaces, archived, ungroupedOrder, worktreeWorkspaceOf)'],
  ['deriveGroups signature declares the mapping',
    'function deriveGroups(list, workspaces, archivedSessionIds, view, worktreeWorkspaceOf)'],
  ['deriveGroups passes the mapping through',
    'for (const g of groupByWorkspace(list, workspaces, archived, view.ungroupedOrder, worktreeWorkspaceOf))'],
  ['deriveGroups call carries the mapping as 5th arg',
    '}, worktreeWorkspaceOf), ['],
  ['rehome block present',
    'const wts = new Map(); const rest = [];'],
]
for (const [label, marker] of markers) {
  if (patched.includes(marker)) console.log(`ok ${label}`)
  else fail(`missing marker: ${label}`)
}
if (patched.includes('}), worktreeWorkspaceOf, [')) {
  fail('stray useMemo argument form still present (}), worktreeWorkspaceOf, [)')
} else {
  console.log('ok no stray useMemo argument form')
}

// Structural check: every component whose body references the mapping must
// destructure it — a signature edit that lands on the wrong component passes
// the string markers above but throws ReferenceError at render time. Find each
// `worktreeWorkspaceOf` use and the function whose destructure precedes it.
{
  const deriveGroupsUse = patched.indexOf('(0, react.useMemo)(() => deriveGroups(')
  if (deriveGroupsUse === -1) {
    fail('structural: deriveGroups useMemo not found')
  } else {
    // The useMemo lives in SessionTree; walk back to its definition and read
    // the destructure between `({` and `}) {`.
    const def = patched.lastIndexOf('function SessionTree({', deriveGroupsUse)
    if (def === -1) {
      fail('structural: SessionTree definition not found before the deriveGroups useMemo')
    } else {
      const close = patched.indexOf('}) {', def)
      const destructure = close === -1 ? '' : patched.slice(def, close)
      if (destructure.includes('worktreeWorkspaceOf')) {
        console.log('ok structural: SessionTree (owner of the deriveGroups useMemo) destructures the mapping')
      } else {
        fail('structural: the component owning the deriveGroups useMemo does not destructure worktreeWorkspaceOf')
      }
    }
  }
}

// 2. execute the patched bundle through the stubbed loader
let loaded = null
const sandbox = {
  window: { __ModuleLoader__: { load: (payload) => { loaded = payload } } },
  console,
}
vm.createContext(sandbox)
try {
  vm.runInContext(patched, sandbox, { filename: 'client.js' })
} catch (error) {
  fail(`bundle execution threw at load: ${error.message}`)
  process.exit(1)
}
if (loaded === null) {
  fail('bundle did not call window.__ModuleLoader__.load')
  process.exit(1)
}
console.log(`ok bundle registers as ${loaded.id}`)

// Require stub: every module answers any property with a constructable
// function, so top-level destructuring, calls, and `class extends` cannot
// throw. Uses a regular function (arrow functions are not constructable).
const stubModule = new Proxy(function () {}, { get: () => function () {} })
const fakeRequire = () => stubModule
try {
  const moduleExports = loaded.factory(fakeRequire)
  if (typeof moduleExports.apply !== 'function') fail('factory exports.apply is not a function')
  else console.log('ok factory registers apply')
  if (typeof moduleExports.inject === 'function' || Array.isArray(moduleExports.inject)) {
    console.log('ok factory registers inject')
  } else {
    fail(`factory exports.inject has unexpected type ${typeof moduleExports.inject}`)
  }
} catch (error) {
  fail(`factory threw: ${error.message}`)
}

// 3. behavioral test of the patched groupByWorkspace
const extractFunction = (source, name) => {
  const start = source.indexOf(`function ${name}(`)
  if (start === -1) return null
  const open = source.indexOf('{', start)
  let depth = 0
  let i = open
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) break
    }
  }
  return source.slice(start, i + 1)
}

const parts = [
  'const UNGROUPED_LABEL = "Ungrouped";',
  extractFunction(patched, 'byRecency'),
  extractFunction(patched, 'sessionVisible'),
  extractFunction(patched, 'buildGroup'),
  extractFunction(patched, 'orderedUngrouped'),
  extractFunction(patched, 'groupByWorkspace'),
]
if (parts.some(part => part === null)) {
  fail('could not extract one of byRecency/sessionVisible/buildGroup/orderedUngrouped/groupByWorkspace')
} else {
  const harness = parts.join('\n') + `
    const list = {
      current: undefined,
      ids: ['s-main', 's-wt-1', 's-wt-2', 's-orphan'],
      byId: {
        's-main': { id: 's-main', origin: 'user', blank: false, updatedAt: 4 },
        's-wt-1': { id: 's-wt-1', origin: 'user', blank: false, updatedAt: 3 },
        's-wt-2': { id: 's-wt-2', origin: 'user', blank: false, updatedAt: 2 },
        's-orphan': { id: 's-orphan', origin: 'user', blank: false, updatedAt: 1 },
      },
    }
    const workspaces = [
      { workspaceId: 'ws-a', path: '/ws-a', createdAt: '2024-01-01T00:00:00.000Z', title: 'A', sessionIds: ['s-main'] },
    ]
    // Worktree sessions map to their OWNING workspace (the plugin returns
    // entity.workspaceId); one stray is not in any worktree.
    const worktreeWorkspaceOf = (id) => (id === 's-wt-1' || id === 's-wt-2' ? 'ws-a' : undefined)
    const groups = groupByWorkspace(list, workspaces, new Set(), undefined, worktreeWorkspaceOf)
    globalThis.__result = groups.map(g => ({ key: g.key, workspaceId: g.workspaceId, sessionIds: g.sessions.map(s => s.id) }))
  `
  const context = vm.createContext({})
  try {
    vm.runInContext(harness, context)
    const groups = context.__result
    const wsA = groups.find(g => g.workspaceId === 'ws-a')
    if (wsA === undefined) {
      fail('behavioral: no ws-a group')
    } else {
      const ids = wsA.sessionIds.join(',')
      if (ids === 's-main,s-wt-1,s-wt-2') console.log('ok behavioral: worktree sessions re-homed into owning workspace (accounted first)')
      else fail(`behavioral: ws-a sessions are ${ids}`)
    }
    const ungrouped = groups.find(g => g.workspaceId === undefined)
    if (ungrouped === undefined || ungrouped.sessionIds.join(',') !== 's-orphan') {
      fail(`behavioral: ungrouped should hold only s-orphan, got ${ungrouped?.sessionIds.join(',') ?? 'no group'}`)
    } else {
      console.log('ok behavioral: true orphan stays in Ungrouped')
    }
    const total = groups.reduce((n, g) => n + g.sessionIds.length, 0)
    if (total !== 4) fail(`behavioral: ${total} sessions accounted, expected 4`)
    else console.log('ok behavioral: all sessions accounted (no loss)')
  } catch (error) {
    fail(`behavioral harness threw: ${error.message}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nworkspace seam verified: markers present, bundle executes, rehome behavior correct')
