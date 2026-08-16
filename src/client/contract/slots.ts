/**
 * dsk-clemento-worktree client contracts: the registrant-side props
 * composition for the `sidebar.footer.action` entry (the new-session-in-
 * worktree trigger) and the `conversation.session.header.actions` badge.
 * The footer action slot is declared by ui-sidebar (root scope, always
 * visible, including the blank new-session page); the header slot is declared
 * by ui-conversation.
 */
import type { SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { HostObservable, PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-conversation's SlotMap merge (the header-actions entry)
// and ui-sidebar's footer-action entry into every program that sees this
// contract, so PropsRuntime resolves.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { WorktreeKey } from '../locales.ts'
import type { WorktreeView } from '@killertux/dsh-clemento-worktree/types'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The worktree badge and new-session-in-worktree flow copy. */
    worktree: WorktreeKey
  }
}

/**
 * Registrant-private injected share. The hooks compartment binds the current
 * worktree list as `useWorktrees`; the callbacks drive the host registry and
 * session creation. The workspace list comes from the framework's global
 * `useWorkspaces` hook (the footer action slot is root-scoped).
 */
export type WorktreeInjected = {
  hooks: {
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

/** Props of the always-visible sidebar footer trigger + its chooser dialog. */
export type WorktreeFooterActionProps =
  PropsRuntime<'sidebar.footer.action'>
  & {
    /** Bound worktree-list selector hook (renderer binds the inject hooks compartment). */
    useWorktrees: SnapshotSelectorHook<WorktreeView[] | undefined>
  }
  & Omit<WorktreeInjected, 'hooks'>
  & PropsLocale<'worktree'>

/** Narrow props of the static header badge: only the session kit and the lookup. */
export type WorktreeBadgeProps =
  PropsRuntime<'conversation.session.header.actions'>
  & Pick<WorktreeInjected, 'worktreeOf'>
  & PropsLocale<'worktree'>
