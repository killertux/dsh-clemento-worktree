import type { WorktreeOverlayActionProps } from './contract/slots.ts';
interface DialogProps extends WorktreeOverlayActionProps {
    /** Withdraw the dialog. */
    onClose: () => void;
}
/**
 * Worktree selector for the next session: the workspace is the one already
 * chosen by the start-page workspace selector (derived from the current blank
 * session's cwd), so the dialog only lists that workspace's worktrees — the
 * main worktree included — or offers a new branch. Choosing one applies it:
 * the blank session whose cwd is the worktree path is opened (created if
 * missing), so the first message starts the session in that worktree.
 */
export declare function WorktreeChooserDialog({ useSessions, useWorkspaces, useWorktrees, listWorktrees, createWorktree, selectWorktree, onClose, t, }: DialogProps): JSX.Element;
/**
 * Floating worktree selector trigger (shell overlay layer, root scope).
 * Hidden once the current session has started (a non-blank session): it is
 * meant for the start page — before or right after choosing a workspace,
 * while the session is still blank.
 */
export declare function WorktreeComposerButton(props: WorktreeOverlayActionProps): JSX.Element | null;
export {};
