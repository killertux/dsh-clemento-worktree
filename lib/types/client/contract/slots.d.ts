/**
 * dsk-clemento-worktree client contracts: the registrant-side props
 * composition for the `sidebar.footer.action` entry (the new-session-in-
 * worktree trigger) and the `conversation.session.header.actions` badge.
 * The footer action slot is declared by ui-sidebar (root scope, always
 * visible, including the blank new-session page); the header slot is declared
 * by ui-conversation.
 */
import type { SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client';
import type { HostObservable, PropsLocale, PropsRuntime, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots';
import type { WorktreeKey } from '../locales.ts';
import type { WorktreeView } from '@killertux/dsh-clemento-worktree/types';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The worktree badge and new-session-in-worktree flow copy. */
        worktree: WorktreeKey;
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
        worktrees: HostObservable<WorktreeView[] | undefined>;
    };
    /** Resolve the worktree accounting a session (badge lookup). */
    worktreeOf(sessionId: SessionId): Promise<WorktreeView | null>;
    /** Fresh worktree list for a workspace (also refreshes the hook feed). */
    listWorktrees(workspaceId: WorkspaceId): Promise<WorktreeView[]>;
    /** Create a linked worktree on a NEW branch (git add + durable record). */
    createWorktree(workspaceId: WorkspaceId, branch: string): Promise<WorktreeView>;
    /**
     * Apply a worktree choice: reuse-or-create the blank session whose cwd is
     * the worktree path and open it, so the first message starts the session
     * in that worktree.
     */
    selectWorktree(worktreePath: string): Promise<void>;
};
/** Props of the floating worktree-setup trigger + its chooser dialog. */
export type WorktreeOverlayActionProps = PropsRuntime<'shell.overlay'> & {
    /** Bound worktree-list selector hook (renderer binds the inject hooks compartment). */
    useWorktrees: SnapshotSelectorHook<WorktreeView[] | undefined>;
} & Omit<WorktreeInjected, 'hooks'> & PropsLocale<'worktree'>;
/** Narrow props of the static header badge: only the session kit and the lookup. */
export type WorktreeBadgeProps = PropsRuntime<'conversation.session.header.actions'> & Pick<WorktreeInjected, 'worktreeOf'> & PropsLocale<'worktree'>;
