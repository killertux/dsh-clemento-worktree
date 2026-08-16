/**
 * ui-worktree contracts: the registrant-side props composition for the
 * `conversation.session.header.actions` entries (badge + new-session button).
 * The slot is declared by ui-conversation; this package registers into it.
 */
import type { SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { HostObservable, PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-conversation's SlotMap merge (the header-actions entry)
// into every program that sees this contract, so PropsRuntime resolves.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { WorktreeKey } from '../locales.ts'
import type { WorktreeView } from '@killertux/dsh-clemento-worktree/types'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The worktree badge and new-session-in-worktree flow copy. */
    worktree: WorktreeKey
  }
}

/**
 * Registrant-private injected share. The hooks compartment binds the
 * workspace list and the current worktree list as `useWorkspaceList` /
 * `useWorktrees` selector hooks; the callbacks drive the host registry and
 * session creation.
 */
export type WorktreeInjected = {
  hooks: {
    /** Workspace list snapshot (the workspaces runtime's live feed). */
    workspaceList: HostObservable<WorkspaceListState>
    /** Worktrees of the workspace the chooser currently shows; undefined before any pick. */
    worktrees: HostObservable<WorktreeView[] | undefined>
  }
  /** Resolve the worktree accounting a session (badge lookup). */
  worktreeOf(sessionId: SessionId): Promise<WorktreeView | null>
  /** Fresh worktree list for a workspace (also refreshes the hook feed). */
  listWorktrees(workspaceId: WorkspaceId): Promise<WorktreeView[]>
  /** Create a linked worktree on a NEW branch (git add + durable record). */
  createWorktree(workspaceId: WorkspaceId, branch: string): Promise<WorktreeView>
  /** Create a session in a worktree directory and open it. */
  startSessionIn(worktreePath: string): Promise<void>
}

/** Full props of the interactive new-session-in-worktree entry. */
export type WorktreeHeaderProps =
  PropsRuntime<'conversation.session.header.actions'>
  & {
    /** Bound workspace-list selector hook (renderer binds the inject hooks compartment). */
    useWorkspaceList: SnapshotSelectorHook<WorkspaceListState>
    /** Bound worktree-list selector hook (renderer binds the inject hooks compartment). */
    useWorktrees: SnapshotSelectorHook<WorktreeView[] | undefined>
  }
  & Omit<WorktreeInjected, 'hooks'>
  & PropsLocale<'worktree'>

/** Narrow props of the static badge entry: only the session kit and the lookup. */
export type WorktreeBadgeProps =
  PropsRuntime<'conversation.session.header.actions'>
  & Pick<WorktreeInjected, 'worktreeOf'>
  & PropsLocale<'worktree'>
