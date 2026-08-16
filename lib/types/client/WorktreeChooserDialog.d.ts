import type { WorktreeHeaderProps } from './contract/slots.ts';
interface DialogProps extends WorktreeHeaderProps {
    /** Withdraw the dialog. */
    onClose: () => void;
}
/**
 * Modal chooser: pick a workspace, then an existing worktree (the main
 * worktree included) or a new branch; starting creates a session in that
 * worktree's directory and opens it.
 */
export declare function WorktreeChooserDialog({ useWorkspaceList, useWorktrees, listWorktrees, createWorktree, startSessionIn, onClose, t, }: DialogProps): JSX.Element;
/** Header action button that opens the worktree chooser. */
export declare function WorktreeNewSessionButton(props: WorktreeHeaderProps): JSX.Element;
export {};
