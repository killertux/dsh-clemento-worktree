/**
 * Git worktree command seam (`ctx.worktreeGit`): porcelain `worktree list`
 * parsing plus linked-worktree add/remove over the subprocess seam. Runs
 * `git -C` from an existing directory and collects bounded output; owns no
 * durable state — the workspace registry decides which entries are
 * registered. Commands always run against the git installation resolved by
 * the subprocess provider.
 * @module @deepseek-ai/dsh-worktree-git
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { GitWorktreeEntry } from './types.ts';
export type { GitCommandResult, GitWorktreeEntry } from './types.ts';
/** One git command failed or could not start; `stderr` carries git's message. */
export declare class GitCommandError extends Error {
    readonly argv: readonly string[];
    readonly cwd: string;
    readonly exitCode: number;
    readonly stderr: string;
    /**
     * @param message - Human-readable failure summary.
     * @param argv - The exact argv attempted.
     * @param cwd - The directory the command ran in.
     * @param exitCode - Process exit code, or 1 when the process could not start or died from a signal.
     * @param stderr - Collected stderr text.
     */
    constructor(message: string, argv: readonly string[], cwd: string, exitCode: number, stderr: string);
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        worktreeGit: WorktreeGit;
    }
}
/**
 * The default sibling directory for a new linked worktree on `branch`: the
 * workspace's parent directory plus `<workspace-basename>-<sanitized-branch>`.
 * @param workspacePath - Canonical main worktree (workspace) directory.
 * @param branch - Short branch name the new worktree checks out.
 * @returns the absolute default sibling path.
 */
export declare function siblingPath(workspacePath: string, branch: string): string;
/**
 * Git worktree command seam. One concrete service over {@link WorktreeGit}
 * `ctx.subprocess`; there is no swappable backend because every worktree
 * command is a local git invocation.
 */
export declare class WorktreeGit extends Service {
    static inject: string[];
    constructor(ctx: Context);
    /**
     * Whether an existing directory is inside a git worktree. A missing git
     * executable or any git failure answers false — this is the discovery
     * guard, not a diagnostic.
     * @param path - Existing directory, in any spelling.
     * @returns true when `git rev-parse --is-inside-work-tree` succeeds.
     */
    isGitRepo(path: string): Promise<boolean>;
    /**
     * The worktree root containing a directory: the checkout root for a main
     * worktree, the linked worktree directory otherwise.
     * @param path - Existing directory inside a worktree.
     * @returns the worktree root, or undefined when the command fails.
     */
    worktreeRoot(path: string): Promise<string | undefined>;
    /**
     * Short branch name checked out at a directory, or undefined when HEAD is
     * detached or the directory is not inside a worktree.
     * @param path - Existing directory inside a worktree.
     * @returns the short branch name (`refs/heads/` stripped).
     */
    currentBranch(path: string): Promise<string | undefined>;
    /**
     * Every worktree of the repository containing a directory, in `git
     * worktree list` order: the main worktree first, then linked worktrees.
     * @param path - Existing directory inside a worktree.
     * @returns parsed porcelain entries.
     * @throws {GitCommandError} when git fails (for example the path is not inside a worktree).
     */
    listWorktrees(path: string): Promise<GitWorktreeEntry[]>;
    /**
     * Create a linked worktree on a NEW branch at the default sibling path
     * (see {@link siblingPath}). A free suffix (`-2`, `-3`, …) is appended when
     * the default path already exists.
     * @param workspacePath - Canonical main worktree (workspace) directory.
     * @param branch - Short branch name for the new worktree; must not exist yet.
     * @returns the created worktree entry.
     * @throws {GitCommandError} when git rejects the creation (for example the branch already exists).
     */
    addWorktree(workspacePath: string, branch: string): Promise<GitWorktreeEntry>;
    /**
     * Remove a linked worktree directory and its git metadata, always with
     * `--force` (uncommitted changes and a locked worktree are discarded). The
     * main worktree can never be removed.
     * @param workspacePath - Canonical main worktree (workspace) directory.
     * @param worktreePath - Linked worktree directory to remove.
     * @returns resolution after git confirmed removal.
     * @throws {GitCommandError} when git rejects the removal.
     */
    removeWorktree(workspacePath: string, worktreePath: string): Promise<void>;
    private availableSiblingPath;
    private runGit;
}
export default WorktreeGit;
