import type { WorktreeOverlayActionProps } from './contract/slots.ts';
interface DialogProps extends WorktreeOverlayActionProps {
    /** Withdraw the dialog. */
    onClose: () => void;
}
/**
 * Modal chooser: pick a workspace, then an existing worktree (the main
 * worktree included) or a new branch; starting creates a session in that
 * worktree's directory and opens it.
 */
export declare function WorktreeChooserDialog({ useWorkspaces, useWorktrees, listWorktrees, createWorktree, startSessionIn, onClose, t, }: DialogProps): JSX.Element;
/** Floating worktree-setup trigger (shell overlay layer, root scope). */
export declare function WorktreeComposerButton(props: WorktreeOverlayActionProps): JSX.Element;
export {};
