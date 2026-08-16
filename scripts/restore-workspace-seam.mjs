#!/usr/bin/env node
/**
 * Restore `@deepseek-ai/dsh-client-ui-workspace`'s client bundle to pristine:
 * reverses the worktree seam edits, including repairing the mangled
 * `...sessionOrderByAccount[""]` spread that a broken seam version inserted
 * (a syntax error that prevented the bundle from registering).
 *
 *   node scripts/restore-workspace-seam.mjs <package-dir>
 *
 * Run this if the web UI fails to start with
 * "... loaded without registering ... via _ModuleLoader_.load" for the
 * workspace bundle, then reinstall/apply the fixed postinstall.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (dir === undefined) {
  console.error('usage: node scripts/restore-workspace-seam.mjs <package-dir>')
  process.exit(1)
}
const file = join(dir, 'lib', 'client.js')
if (!existsSync(file)) {
  console.error(`no bundle at ${file}`)
  process.exit(1)
}

const code = readFileSync(file, 'utf8')
if (!code.includes('worktreeWorkspaceOf') && !code.includes('...sessionOrderByAccount')) {
  console.log('no workspace seam found — nothing to restore')
  process.exit(0)
}

const edits = [
  // repair the mangled W3 spread
  ['repair W3 spread', '{ ungroupedOrder: ...sessionOrderByAccount[""] }', '{ ungroupedOrder: sessionOrderByAccount[""] }'],
  // reverse the deriveGroups argument addition — both the broken (stray
  // useMemo arg) and the corrected (5th deriveGroups arg) forms
  ['reverse deriveGroups arg (broken)', 'sessionOrderByAccount[""] }\n\t\t\t}), worktreeWorkspaceOf, [', 'sessionOrderByAccount[""] }\n\t\t\t}), ['],
  ['reverse deriveGroups arg (fixed)', 'sessionOrderByAccount[""] }\n\t\t\t}, worktreeWorkspaceOf), [', 'sessionOrderByAccount[""] }\n\t\t\t}), ['],
  // reverse the signature member
  ['reverse signature', 'renderSlot, worktreeWorkspaceOf, t }) {', 'renderSlot, t }) {'],
  // reverse the inject factory member
  ['reverse factory', 'worktreeWorkspaceOf: (id) => { const m = ctx.get("worktreeWorkspace"); return m == null ? void 0 : m.workspaceOf(id) },\n\t\t\t\tstartSession: (workspaceId) => {', 'startSession: (workspaceId) => {'],
  // reverse the groupByWorkspace signature parameter
  ['reverse groupByWorkspace signature', 'function groupByWorkspace(list, workspaces, archived, ungroupedOrder, worktreeWorkspaceOf) {', 'function groupByWorkspace(list, workspaces, archived, ungroupedOrder) {'],
  // reverse the deriveGroups signature parameter
  ['reverse deriveGroups signature', 'function deriveGroups(list, workspaces, archivedSessionIds, view, worktreeWorkspaceOf) {', 'function deriveGroups(list, workspaces, archivedSessionIds, view) {'],
  // reverse the deriveGroups → groupByWorkspace pass-through
  ['reverse pass-through', 'for (const g of groupByWorkspace(list, workspaces, archived, view.ungroupedOrder, worktreeWorkspaceOf)) {', 'for (const g of groupByWorkspace(list, workspaces, archived, view.ungroupedOrder)) {'],
  // reverse the groupByWorkspace rehome block
  ['reverse rehome block', 'const stray = list.ids.map((id) => list.byId[id]).filter((s) => s !== void 0 && !accounted.has(s.id) && sessionVisible(s, list.current, archived));'
    + '\n\t\t\tconst wts = new Map(); const rest = [];'
    + '\n\t\t\tfor (const s of stray) { const wid = worktreeWorkspaceOf?.(s.id); if (wid !== void 0) { const a = wts.get(wid); if (a === void 0) wts.set(wid, [s]); else a.push(s); } else rest.push(s); }'
    + '\n\t\t\tfor (const g of groups) { const extra = wts.get(g.key); if (extra !== void 0) g.sessions.push(...extra); }'
    + '\n\t\t\tif (rest.length > 0) groups.push(buildGroup("", void 0, void 0, void 0, UNGROUPED_LABEL, ungroupedOrder === void 0 ? rest : orderedUngrouped(rest, ungroupedOrder), ungroupedOrder === void 0 ? "recency" : "account"));',
    'const stray = list.ids.map((id) => list.byId[id]).filter((s) => s !== void 0 && !accounted.has(s.id) && sessionVisible(s, list.current, archived));'
    + '\n\t\t\tif (stray.length > 0) groups.push(buildGroup("", void 0, void 0, void 0, UNGROUPED_LABEL, ungroupedOrder === void 0 ? stray : orderedUngrouped(stray, ungroupedOrder), ungroupedOrder === void 0 ? "recency" : "account"));'],
]

let out = code
let changed = false
for (const [label, from, to] of edits) {
  const count = out.split(from).length - 1
  if (count === 0) continue
  if (count !== 1) {
    console.error(`SKIP ${label}: anchor found ${count} times (expected 0 or 1)`)
    continue
  }
  out = out.replace(from, to)
  changed = true
  console.log(`ok ${label}`)
}
if (!changed) {
  console.log('nothing to restore')
  process.exit(0)
}
writeFileSync(file, out)
console.log('workspace bundle restored to pristine — now run the fixed postinstall (or reinstall the plugin)')
