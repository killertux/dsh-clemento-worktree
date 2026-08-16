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


/** The ui-workspace seam edits, over its client bundle. */
const WORKSPACE_EDITS = [
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
    'deriveGroups call',
    'sessionOrderByAccount[""] }\n\t\t\t}), [',
    '...sessionOrderByAccount[""] }\n\t\t\t}), worktreeWorkspaceOf, [',
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

/** Apply the ui-workspace seam to one bundle source (idempotent per edit). */
export function applyWorkspaceSeam(code) {
  return applyEdits(code, WORKSPACE_EDITS)
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
