/**
 * Worktree UI plugin, browser half. Mounts the `worktreeRegistry` remote and
 * registers two entries: a static worktree badge in the session header
 * (`conversation.session.header.actions`, negative order), and an
 * always-visible "New session in worktree" trigger in the sidebar footer
 * (`sidebar.footer.action`, root scope — reachable on the blank new-session
 * page without an open session) that opens the worktree chooser.
 */
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext, ISessions, SessionId, SessionRuntime, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import worktreeRemote from '@killertux/dsh-clemento-worktree/remote'
import type { WorktreeView } from '@killertux/dsh-clemento-worktree/types'
import type { WorktreeInjected } from './contract/slots.ts'
import { en, zh } from './locales.ts'
import { WorktreeBadge } from './WorktreeBadge.tsx'
import { WorktreeDropdown } from './WorktreeDropdown.tsx'

export type { WorktreeInjected, WorktreeHeroActionProps, WorktreeBadgeProps } from './contract/slots.ts'

const NS = 'worktree'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'sessions', 'workspaces', 'connection', 'remote', 'locale']

/**
 * Mount the worktree remote and register the badge + footer trigger.
 * @param ctx - client cordis context.
 * @returns disposer unwinding remote + registrations in reverse order.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  // The `sessions` Context key is declared by both the host session store and
  // the client runtime; resolve the client face explicitly (the runtime's own
  // ctx.get pattern) so this plugin never depends on which merge wins.
  const sessions = ctx.get('sessions') as unknown as ISessions
  const disposers: Array<() => Promise<void>> = []
  try {
    disposers.push(await ctx.remote.$mount(worktreeRemote))
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-worktree: dictionaries')

  // Browser-local mirror of the workspace's worktrees, fed by list/create.
  const worktrees = createSnapshotStore<WorktreeView[] | undefined>(undefined)
  // Session → owning workspace mapping for sessions running in a git
  // worktree. The ui-conversation seam (worktreeWorkspaceOf) reads this via
  // the provided `worktreeWorkspace` service, so the workspace chip keeps
  // showing the workspace for a linked-worktree session.
  const worktreeBySession = createSnapshotStore<Record<SessionId, WorkspaceId>>({})
  // Session ids we have already asked the registry about — mapped or not.
  // mapBySessions only returns entries for sessions IN a worktree, so without
  // caching negatives every session-list snapshot change re-queries every
  // non-worktree session (the request storm).
  const queriedSessionIds = new Set<SessionId>()
  // Session → worktree cache for the badge (bySession), negatives included.
  const worktreeById = new Map<SessionId, WorktreeView | null>()

  const unwrap = <T,>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  // The `worktreeRegistry` namespace is mounted by $mount above; read it from
  // the service store directly (ctx.get) — property access through the ctx
  // traceable would require a `remote.worktreeRegistry` inject entry that this
  // plugin's own mount would deadlock on.
  const worktreeRegistry = (): TypertRemoteNamespaceMap['worktreeRegistry'] =>
    ctx.get('remote.worktreeRegistry') as TypertRemoteNamespaceMap['worktreeRegistry']

  /** Resolve and cache the owning workspace of sessions running in a worktree. */
  const rememberWorktreeWorkspaces = async (sessionIds: readonly SessionId[]): Promise<void> => {
    const pending = sessionIds.filter(id => !queriedSessionIds.has(id))
    if (pending.length === 0) return
    for (const id of pending) queriedSessionIds.add(id)
    const result = unwrap(await worktreeRegistry().mapBySessions({ sessionIds: pending })).mappings
    const next = { ...worktreeBySession.getSnapshot() }
    let changed = false
    for (const [id, workspaceId] of Object.entries(result)) {
      if (next[id as SessionId] !== workspaceId) {
        next[id as SessionId] = workspaceId
        changed = true
      }
    }
    if (changed) worktreeBySession.set(next)
  }

  // Expose the mapping to the ui-conversation seam: the workspace chip
  // resolves a session's workspace through this service when the cwd account
  // match fails.
  ctx.provide('worktreeWorkspace', {
    workspaceOf: (sessionId: SessionId): WorkspaceId | undefined =>
      worktreeBySession.getSnapshot()[sessionId],
  })

  // Keep the mapping fresh: resolve every session once on boot, then only
  // re-sync when the set of session ids actually changes (new/removed
  // sessions). Snapshot mutations — title edits, running state, message
  // appends — fire the list subscription constantly but never change the id
  // set, so they must not trigger a remote call.
  const sessionsList = sessions.list
  let syncedSessionIds: readonly SessionId[] = []
  const syncWorktreeWorkspaces = (): void => {
    const ids = sessionsList.getSnapshot().ids
    if (ids.length === syncedSessionIds.length
      && ids.every((id, index) => id === syncedSessionIds[index])) return
    syncedSessionIds = ids
    void rememberWorktreeWorkspaces(ids)
  }
  syncWorktreeWorkspaces()
  ctx.effect(() => sessionsList.subscribe(syncWorktreeWorkspaces), 'ui-worktree: session workspace sync')

  const injected = (): WorktreeInjected => ({
    hooks: { worktrees },
    worktreeOf: async sessionId => {
      // Cache per session — negatives included — so the badge's
      // `worktreeOf`-dependent effect does not re-query on every render.
      if (worktreeById.has(sessionId)) return worktreeById.get(sessionId) ?? null
      const view = unwrap(await worktreeRegistry().bySession({ sessionId })).worktree
      worktreeById.set(sessionId, view)
      return view
    },
    listWorktrees: async workspaceId => {
      const views = unwrap(await worktreeRegistry().list({ workspaceId })).items
      worktrees.set(views)
      return views
    },
    createWorktree: async (workspaceId: WorkspaceId, branch: string) => {
      const created = unwrap(await worktreeRegistry().create({ workspaceId, branch })).worktree
      worktrees.set([...(worktrees.getSnapshot() ?? []), created])
      return created
    },
    selectWorktree: async worktreePath => {
      const chosen = (worktrees.getSnapshot() ?? []).find(worktree => worktree.path === worktreePath)
      // Reuse an existing blank session in this worktree (the connectWorkspace
      // reuse scan), else create one through the runtime's own create path —
      // the same manager the workspace flow uses, which lands the id in the
      // list store before resolving.
      const list = sessions.list.getSnapshot()
      for (const id of list.ids) {
        const summary = list.byId[id]
        if (summary !== undefined && summary.blank && summary.cwd === worktreePath) {
          if (chosen !== undefined) {
            worktreeBySession.set({ ...worktreeBySession.getSnapshot(), [id]: chosen.workspaceId })
          }
          sessions.open(id)
          return
        }
      }
      const sessionRuntime = ctx.get('sessions') as unknown as SessionRuntime
      const sessionId = await sessionRuntime.create({ cwd: worktreePath })
      if (chosen !== undefined) {
        worktreeBySession.set({ ...worktreeBySession.getSnapshot(), [sessionId]: chosen.workspaceId })
      }
      sessions.open(sessionId)
    },
  })

  // The badge stays in the session header; the worktree dropdown renders in
  // the start-page hero row (conversation.hero.actions, added by the seam).
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register(
    {
      name: 'conversation.session.header.actions',
      id: 'worktree-badge',
      order: -10,
      inject: injected,
      locale: NS,
    },
    WorktreeBadge,
  ))
  ctx.slots.inject('conversation.hero.actions', () => ctx.slots.register(
    {
      name: 'conversation.hero.actions',
      id: 'worktree-dropdown',
      order: 0,
      inject: injected,
      locale: NS,
    },
    WorktreeDropdown,
  ))

  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
