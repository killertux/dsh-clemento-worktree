import type { WorktreeFooterActionProps } from './contract/slots.ts';
interface DialogProps extends WorktreeFooterActionProps {
    /** Withdraw the dialog. */
    onClose: () => void;
}
/**
 * Modal chooser: pick a workspace, then an existing worktree (the main
 * worktree included) or a new branch; starting creates a session in that
 * worktree's directory and opens it.
 */
export declare function WorktreeChooserDialog({ useWorkspaces, useWorktrees, listWorktrees, createWorktree, startSessionIn, onClose, t, }: DialogProps): JSX.Element;
/** Sidebar footer action that opens the worktree chooser (always visible). */
export declare function WorktreeFooterAction(props: WorktreeFooterActionProps): JSX.Element;
export {};
