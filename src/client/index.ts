/**
 * Worktree UI plugin, browser half. Mounts the `worktreeRegistry` remote and
 * registers two `conversation.session.header.actions` entries: a static
 * badge with the current session's worktree name, and a button opening the
 * new-session-in-worktree chooser.
 */
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext, ISessions, SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import worktreeRemote from '@killertux/dsh-clemento-worktree/remote'
import type { WorktreeView } from '@killertux/dsh-clemento-worktree/types'
import type { WorktreeInjected } from './contract/slots.ts'
import { en, zh } from './locales.ts'
import { WorktreeBadge } from './WorktreeBadge.tsx'
import { WorktreeNewSessionButton } from './WorktreeChooserDialog.tsx'

export type { WorktreeInjected, WorktreeHeaderProps } from './contract/slots.ts'

const NS = 'worktree'
/** How long the new-session flow waits for the created session to land in the list. */
const SESSION_ARRIVAL_TIMEOUT_MS = 3_000

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'sessions', 'workspaces', 'connection', 'remote', 'locale']

/**
 * Mount the worktree remote and register the header entries.
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

  /** Wait until the freshly created session summary lands (host frame merge). */
  const waitForSession = async (sessionId: SessionId): Promise<void> => {
    const deadline = Date.now() + SESSION_ARRIVAL_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (sessions.list.getSnapshot().byId[sessionId] !== undefined) return
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  }

  const injected = (): WorktreeInjected => ({
    hooks: {
      workspaceList: ctx.workspaces.list,
      worktrees,
    },
    worktreeOf: async sessionId =>
      unwrap(await ctx.remote.worktreeRegistry.bySession({ sessionId })).worktree,
    listWorktrees: async workspaceId => {
      const views = unwrap(await ctx.remote.worktreeRegistry.list({ workspaceId })).items
      worktrees.set(views)
      return views
    },
    createWorktree: async (workspaceId: WorkspaceId, branch: string) => {
      const created = unwrap(await ctx.remote.worktreeRegistry.create({ workspaceId, branch })).worktree
      worktrees.set([...(worktrees.getSnapshot() ?? []), created])
      return created
    },
    startSessionIn: async worktreePath => {
      const connection = ctx.get('connection') as ConnectionHandle
      const { result } = await connection.api.sessions.create({ cwd: worktreePath })
      if (!result.ok) throw new Error(result.error.message)
      await waitForSession(result.value.sessionId)
      sessions.open(result.value.sessionId)
    },
  })

  // Badge first (negative-order static context), then the interactive button.
  ctx.slots.inject('conversation.session.header.actions', () => [
    ctx.slots.register(
      {
        name: 'conversation.session.header.actions',
        id: 'worktree-badge',
        order: -10,
        inject: injected,
        locale: NS,
      },
      WorktreeBadge,
    ),
    ctx.slots.register(
      {
        name: 'conversation.session.header.actions',
        id: 'worktree-new-session',
        order: 0,
        inject: injected,
        locale: NS,
      },
      WorktreeNewSessionButton,
    ),
  ])

  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
