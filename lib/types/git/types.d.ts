/**
 * Vocabulary of the git worktree command seam: parsed `git worktree list
 * --porcelain` entries and one collected command outcome.
 * @module @deepseek-ai/dsh-worktree-git/types
 */
/**
 * One `git worktree list --porcelain` entry: a worktree directory with its
 * checked-out branch or detached state. The first entry is the main worktree;
 * every other entry is a linked worktree.
 */
export interface GitWorktreeEntry {
    /** Worktree directory path exactly as git reported it. */
    readonly path: string;
    /** Short branch name (`refs/heads/` prefix stripped), or null when detached. */
    readonly branch: string | null;
    /** True when this worktree's HEAD is detached. */
    readonly detached: boolean;
}
/** Collected outcome of one git command: exit facts plus bounded output. */
export interface GitCommandResult {
    /** Process exit code; 1 when the process died from a signal. */
    readonly exitCode: number;
    /** Collected stdout text (the tail when the stream exceeded the cap). */
    readonly stdout: string;
    /** Collected stderr text (the tail when the stream exceeded the cap). */
    readonly stderr: string;
}
