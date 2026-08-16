import type { WorktreeBadgeProps } from './contract/slots.ts';
/**
 * Static session context: the name of the git worktree the current session
 * runs in, or nothing for sessions outside every worktree. Negative order
 * puts it in the header's leading context band.
 */
export declare function WorktreeBadge({ sessionId, worktreeOf, t }: WorktreeBadgeProps): JSX.Element | null;
