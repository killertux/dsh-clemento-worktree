#!/usr/bin/env node
/**
 * Apply the worktree seam to an installed `@deepseek-ai/dsh-client-ui-conversation`
 * bundle: the workspace chip resolves a session's owning workspace through the
 * plugin-provided `ctx.worktreeWorkspace` service when the cwd-account match
 * fails, so a session running in a git worktree keeps its workspace selected.
 *
 * Usage (after `pnpm patch @deepseek-ai/dsh-client-ui-conversation@0.1.0-rc.6`
 * inside the web profile, which prints a patch directory):
 *
 *   node scripts/patch-conversation-seam.mjs <patch-dir>
 *
 * then `pnpm patch-commit <patch-dir>`. Re-run after every dsh update.
 * The upstream version of this seam lives in ui-conversation's
 * ConversationRoot.tsx / apply.ts (see plan.md).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (dir === undefined) {
  console.error('usage: node scripts/patch-conversation-seam.mjs <pnpm-patch-dir>')
  process.exit(1)
}
const file = join(dir, 'lib', 'client.js')
if (!existsSync(file)) {
  console.error(`no bundle at ${file}`)
  process.exit(1)
}

const code = readFileSync(file, 'utf8')
let out = code
let applied = 0

/** Replace exactly one occurrence; verify it existed and was unique. */
function replaceOnce(label, from, to) {
  const count = out.split(from).length - 1
  if (count !== 1) {
    console.error(`SKIP ${label}: anchor found ${count} times (expected 1)`)
    return
  }
  out = out.replace(from, to)
  applied += 1
  console.log(`ok ${label}`)
}

// 1. sessionWorkspace resolution: account match, then worktree mapping.
replaceOnce(
  'sessionWorkspace resolution',
  'sessionWorkspace = sessionId === void 0 ? void 0 : workspaces.items.find((workspace) => workspace.sessionIds.includes(sessionId))',
  'sessionWorkspace = sessionId === void 0 ? void 0 : workspaces.items.find((workspace) => workspace.sessionIds.includes(sessionId))'
    + ' ?? workspaces.items.find((workspace) => workspace.workspaceId === worktreeWorkspaceOf?.(sessionId))',
)

// 2. ConversationRoot props destructure gains the mapping reader.
replaceOnce(
  'props destructure',
  'renderSlotChain, selectWorkspace, t ',
  'renderSlotChain, selectWorkspace, worktreeWorkspaceOf, t ',
)

// 3. The conversation inject factory wires the reader from the optional
//    plugin service (ctx is the apply closure, in scope for the factory).
replaceOnce(
  'inject factory',
  'hooks: { composerBlock: sessionId === void 0 ? ABSENT_BLOCK : composerBlocks.storeFor(sessionId) },'
    + '\n\t\t\t\t\tselectWorkspace: async (workspaceId) => {',
  'hooks: { composerBlock: sessionId === void 0 ? ABSENT_BLOCK : composerBlocks.storeFor(sessionId) },'
    + '\n\t\t\t\t\tworktreeWorkspaceOf: (id) => { const m = ctx.get("worktreeWorkspace"); return m == null ? void 0 : m.workspaceOf(id) },'
    + '\n\t\t\t\t\tselectWorkspace: async (workspaceId) => {',
)

if (applied !== 3) {
  console.error(`only ${applied}/3 patches applied — the bundle layout may differ; aborting without writing`)
  process.exit(1)
}

writeFileSync(file, out)
console.log('seam applied — run: pnpm patch-commit ' + dir)
