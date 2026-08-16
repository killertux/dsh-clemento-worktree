import type { WorktreeHeroActionProps } from './contract/slots.ts';
/**
 * Start-page worktree dropdown, rendered right of the workspace selector by
 * the ui-conversation seam (`conversation.hero.actions`). The workspace is
 * the one already chosen by the workspace selector (derived from the current
 * blank session's cwd); the menu lists that workspace's worktrees — the main
 * worktree included — or offers a new branch. Choosing one applies it:
 * the blank session whose cwd is the worktree path is opened (created if
 * missing), so the first message starts the session in that worktree.
 */
export declare function WorktreeDropdown(props: WorktreeHeroActionProps): JSX.Element;
