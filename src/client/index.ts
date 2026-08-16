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
import { WorktreeComposerButton } from './WorktreeChooserDialog.tsx'

export type { WorktreeInjected, WorktreeOverlayActionProps, WorktreeBadgeProps } from './contract/slots.ts'

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

  const injected = (): WorktreeInjected => ({
    hooks: { worktrees },
    worktreeOf: async sessionId =>
      unwrap(await worktreeRegistry().bySession({ sessionId })).worktree,
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
      // Reuse an existing blank session in this worktree (the connectWorkspace
      // reuse scan), else create one through the runtime's own create path —
      // the same manager the workspace flow uses, which lands the id in the
      // list store before resolving.
      const list = sessions.list.getSnapshot()
      for (const id of list.ids) {
        const summary = list.byId[id]
        if (summary !== undefined && summary.blank && summary.cwd === worktreePath) {
          sessions.open(summary.id)
          return
        }
      }
      const sessionRuntime = ctx.get('sessions') as unknown as SessionRuntime
      const sessionId = await sessionRuntime.create({ cwd: worktreePath })
      sessions.open(sessionId)
    },
  })

  // The badge stays in the session header; the trigger floats in the shell
  // overlay layer (root scope), so it is reachable on the blank new-session
  // page without an open session.
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
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'worktree-new-session',
      order: 0,
      inject: injected,
      locale: NS,
    },
    WorktreeComposerButton,
  ))

  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
