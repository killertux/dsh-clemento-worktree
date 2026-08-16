/**
 * The ui-conversation worktree seam, as a pure function over the installed
 * bundle source. Applies five additive edits:
 *
 *   1. `ConversationRoot` props gain `worktreeWorkspaceOf`;
 *   2. the workspace chip's `sessionWorkspace` resolution falls back to the
 *      plugin-provided mapping (session → owning workspace via worktrees);
 *   3. the conversation inject factory wires `worktreeWorkspaceOf` from the
 *      optional `ctx.worktreeWorkspace` service;
 *   4. the conversation entry declares a `conversation.hero.actions` child
 *      (root-scoped list slot) for the start-page worktree dropdown;
 *   5. the hero row renders that slot right of the workspace selector.
 *
 * Idempotent per edit: an already-applied edit (its result string present)
 * is skipped, so the seam can be completed on a partially patched bundle.
 * The same function backs the manual patch script and the plugin's own
 * postinstall step; upstream equivalents live in ui-conversation's
 * ConversationRoot.tsx / apply.ts / contract.
 */
import { createContext, runInContext } from 'node:vm'

/** Apply the seam to one bundle source. Returns the transformed code when applied. */
export function applySeam(code) {
  const edits = [
    // 1. props destructure
    [
      'props destructure',
      'renderSlotChain, selectWorkspace, t ',
      'renderSlotChain, selectWorkspace, worktreeWorkspaceOf, t ',
    ],
    // 2. sessionWorkspace resolution fallback
    [
      'sessionWorkspace resolution',
      'sessionWorkspace = sessionId === void 0 ? void 0 : workspaces.items.find((workspace) => workspace.sessionIds.includes(sessionId))',
      'sessionWorkspace = sessionId === void 0 ? void 0 : workspaces.items.find((workspace) => workspace.sessionIds.includes(sessionId))'
        + ' ?? workspaces.items.find((workspace) => workspace.workspaceId === worktreeWorkspaceOf?.(sessionId))',
    ],
    // 3. inject factory
    [
      'inject factory',
      'hooks: { composerBlock: sessionId === void 0 ? ABSENT_BLOCK : composerBlocks.storeFor(sessionId) },'
        + '\n\t\t\t\t\tselectWorkspace: async (workspaceId) => {',
      'hooks: { composerBlock: sessionId === void 0 ? ABSENT_BLOCK : composerBlocks.storeFor(sessionId) },'
        + '\n\t\t\t\t\tworktreeWorkspaceOf: (id) => { const m = ctx.get("worktreeWorkspace"); return m == null ? void 0 : m.workspaceOf(id) },'
        + '\n\t\t\t\t\tselectWorkspace: async (workspaceId) => {',
    ],
    // 4. children declaration for the hero actions slot
    [
      'hero actions child',
      '"conversation.hero.agentPreset": {\n\t\t\t\t\t\tkind: "single",\n\t\t\t\t\t\tscope: "root"\n\t\t\t\t\t}\n\t\t\t\t}',
      '"conversation.hero.agentPreset": {\n\t\t\t\t\t\tkind: "single",\n\t\t\t\t\t\tscope: "root"\n\t\t\t\t\t},\n'
        + '\t\t\t\t\t"conversation.hero.actions": {\n\t\t\t\t\t\tkind: "list",\n\t\t\t\t\t\tscope: "root"\n\t\t\t\t\t}\n\t\t\t\t}',
    ],
    // 5. hero row renders the actions slot right of the workspace selector
    [
      'hero actions render',
      'renderSlot("conversation.hero.agentPreset", {})',
      'renderSlot("conversation.hero.actions", {}),\n\t\t\t\t\trenderSlot("conversation.hero.agentPreset", {})',
    ],
  ]

  return applyEdits(code, edits)
}


/**
 * The ui-workspace seam edits, over its client bundle.
 *
 * Edit set (all idempotent):
 *   1. `WorkspaceBrowser` props gain `worktreeWorkspaceOf`;
 *   2. the inject factory wires it from the optional `ctx.worktreeWorkspace`
 *      service;
 *   3. `deriveGroups(...)` gains the mapping as its 5th argument (the call is
 *      patched *inside* the call, not as a stray `useMemo` argument);
 *   4. `groupByWorkspace` and `deriveGroups` signatures declare the mapping
 *      parameter — the rehome block below reads it, so a bundle without these
 *      signature edits throws `ReferenceError` and kills the sidebar;
 *   5. `deriveGroups` passes the mapping through to `groupByWorkspace`;
 *   6. the rehome block groups worktree sessions under their owning workspace
 *      instead of Ungrouped.
 */
const WORKSPACE_SIMPLE_EDITS = [
  [
    'browser signature',
    'searchResultLimit, useDirectoryFlow, renderSlot, t }) {',
    'searchResultLimit, useDirectoryFlow, renderSlot, worktreeWorkspaceOf, t }) {',
  ],
  [
    'browser inject factory',
    'const browserInjected = () => ({\n\t\t\t\tstartSession: (workspaceId) => {',
    'const browserInjected = () => ({\n\t\t\t\tworktreeWorkspaceOf: (id) => { const m = ctx.get("worktreeWorkspace"); return m == null ? void 0 : m.workspaceOf(id) },\n\t\t\t\tstartSession: (workspaceId) => {',
  ],
  [
    'groupByWorkspace signature',
    'function groupByWorkspace(list, workspaces, archived, ungroupedOrder) {',
    'function groupByWorkspace(list, workspaces, archived, ungroupedOrder, worktreeWorkspaceOf) {',
  ],
  [
    'deriveGroups signature',
    'function deriveGroups(list, workspaces, archivedSessionIds, view) {',
    'function deriveGroups(list, workspaces, archivedSessionIds, view, worktreeWorkspaceOf) {',
  ],
  [
    'deriveGroups pass-through',
    'for (const g of groupByWorkspace(list, workspaces, archived, view.ungroupedOrder)) {',
    'for (const g of groupByWorkspace(list, workspaces, archived, view.ungroupedOrder, worktreeWorkspaceOf)) {',
  ],
  [
    'groupByWorkspace rehome',
    'const stray = list.ids.map((id) => list.byId[id]).filter((s) => s !== void 0 && !accounted.has(s.id) && sessionVisible(s, list.current, archived));'
      + '\n\t\t\tif (stray.length > 0) groups.push(buildGroup("", void 0, void 0, void 0, UNGROUPED_LABEL, ungroupedOrder === void 0 ? stray : orderedUngrouped(stray, ungroupedOrder), ungroupedOrder === void 0 ? "recency" : "account"));',
    'const stray = list.ids.map((id) => list.byId[id]).filter((s) => s !== void 0 && !accounted.has(s.id) && sessionVisible(s, list.current, archived));'
      + '\n\t\t\tconst wts = new Map(); const rest = [];'
      + '\n\t\t\tfor (const s of stray) { const wid = worktreeWorkspaceOf?.(s.id); if (wid !== void 0) { const a = wts.get(wid); if (a === void 0) wts.set(wid, [s]); else a.push(s); } else rest.push(s); }'
      + '\n\t\t\tfor (const g of groups) { const extra = wts.get(g.key); if (extra !== void 0) g.sessions.push(...extra); }'
      + '\n\t\t\tif (rest.length > 0) groups.push(buildGroup("", void 0, void 0, void 0, UNGROUPED_LABEL, ungroupedOrder === void 0 ? rest : orderedUngrouped(rest, ungroupedOrder), ungroupedOrder === void 0 ? "recency" : "account"));',
  ],
]

/** The pristine `deriveGroups` call tail (before any seam). */
const DERIVE_GROUPS_CALL_PRISTINE = 'sessionOrderByAccount[""] }\n\t\t\t}), ['
/** The broken form an earlier seam version produced (stray useMemo argument). */
const DERIVE_GROUPS_CALL_BROKEN = 'sessionOrderByAccount[""] }\n\t\t\t}), worktreeWorkspaceOf, ['
/** The correct form: the mapping is the 5th argument of `deriveGroups(...)`. */
const DERIVE_GROUPS_CALL_FIXED = 'sessionOrderByAccount[""] }\n\t\t\t}, worktreeWorkspaceOf), ['

/** Apply the ui-workspace seam to one bundle source (idempotent per edit). */
export function applyWorkspaceSeam(code) {
  const missing = []
  let out = code
  for (const [label, from, to] of WORKSPACE_SIMPLE_EDITS) {
    if (out.includes(to)) continue
    const count = out.split(from).length - 1
    if (count !== 1) {
      missing.push(`${label} (found ${count}, expected 1)`)
      continue
    }
    out = out.replace(from, to)
  }
  // The deriveGroups call needs three-way handling: already fixed, broken
  // (stray useMemo argument from a previous seam version), or pristine.
  if (out.includes(DERIVE_GROUPS_CALL_FIXED)) {
    // already correct
  } else if (out.includes(DERIVE_GROUPS_CALL_BROKEN)) {
    out = out.replace(DERIVE_GROUPS_CALL_BROKEN, DERIVE_GROUPS_CALL_FIXED)
  } else if (out.includes(DERIVE_GROUPS_CALL_PRISTINE)) {
    out = out.replace(DERIVE_GROUPS_CALL_PRISTINE, DERIVE_GROUPS_CALL_FIXED)
  } else {
    missing.push('deriveGroups call (pristine/broken/fixed anchor not found)')
  }
  if (missing.length > 0) return { status: 'mismatch', missing }
  return out === code ? { status: 'already', missing: [] } : { status: 'applied', code: out, missing: [] }
}

/**
 * Execute a served bundle through a stubbed `window.__ModuleLoader__` and
 * assert its factory registers without throwing. Catches the class of bug
 * where a bundle parses (and even `node --check`s) but crashes at load or
 * during factory evaluation — e.g. the broken workspace seam version, whose
 * patched bundle was syntactically fine yet failed to register.
 * @param code - bundle source.
 * @param expectedId - the module id the bundle must register under.
 * @returns `{ ok: true }` or `{ ok: false, error }`.
 */
export function bundleExecutes(code, expectedId) {
  let loaded = null
  const sandbox = {
    window: { __ModuleLoader__: { load: (payload) => { loaded = payload } } },
    console,
  }
  try {
    createContext(sandbox)
    runInContext(code, sandbox, { filename: 'client.js' })
  } catch (error) {
    return { ok: false, error: `load threw: ${error.message}` }
  }
  if (loaded === null || loaded.id !== expectedId) {
    return { ok: false, error: `did not register as ${expectedId}` }
  }
  // Require stub: every module answers any property with a constructable
  // function, so top-level destructuring, calls, and `class extends` cannot
  // throw. Uses a regular function (arrow functions are not constructable).
  const stubModule = new Proxy(function () {}, { get: () => function () {} })
  try {
    const moduleExports = loaded.factory(() => stubModule)
    if (typeof moduleExports.apply !== 'function') {
      return { ok: false, error: 'factory exports.apply is not a function' }
    }
  } catch (error) {
    return { ok: false, error: `factory threw: ${error.message}` }
  }
  return { ok: true }
}

function applyEdits(code, edits) {
  let out = code
  const missing = []
  let changed = false
  for (const [label, from, to] of edits) {
    if (out.includes(to)) continue
    const count = out.split(from).length - 1
    if (count !== 1) {
      missing.push(`${label} (found ${count}, expected 1)`)
      continue
    }
    out = out.replace(from, to)
    changed = true
  }
  if (missing.length > 0) return { status: 'mismatch', missing }
  return changed ? { status: 'applied', code: out, missing: [] } : { status: 'already', missing: [] }
}
