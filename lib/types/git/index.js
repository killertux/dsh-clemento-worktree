/**
 * Git worktree command seam (`ctx.worktreeGit`): porcelain `worktree list`
 * parsing plus linked-worktree add/remove over the subprocess seam. Runs
 * `git -C` from an existing directory and collects bounded output; owns no
 * durable state — the workspace registry decides which entries are
 * registered. Commands always run against the git installation resolved by
 * the subprocess provider.
 * @module @deepseek-ai/dsh-worktree-git
 */
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { Service } from '@deepseek-ai/cordis';
/** Grace period for terminating a hung git process tree. */
const GIT_GRACE_MS = 2_000;
/** In-memory cap for each collected stream of one git command. */
const COLLECT_MAX_BYTES = 1 << 20;
/** Cap on numeric-suffix attempts when the default sibling path exists. */
const MAX_SIBLING_ATTEMPTS = 100;
/** Cap on the sanitized branch segment in a sibling directory name. */
const MAX_BRANCH_SEGMENT_LENGTH = 80;
const collect = { maxBytes: COLLECT_MAX_BYTES };
/** One git command failed or could not start; `stderr` carries git's message. */
export class GitCommandError extends Error {
    argv;
    cwd;
    exitCode;
    stderr;
    /**
     * @param message - Human-readable failure summary.
     * @param argv - The exact argv attempted.
     * @param cwd - The directory the command ran in.
     * @param exitCode - Process exit code, or 1 when the process could not start or died from a signal.
     * @param stderr - Collected stderr text.
     */
    constructor(message, argv, cwd, exitCode, stderr) {
        super(message);
        this.argv = argv;
        this.cwd = cwd;
        this.exitCode = exitCode;
        this.stderr = stderr;
        this.name = 'GitCommandError';
    }
}
/**
 * The default sibling directory for a new linked worktree on `branch`: the
 * workspace's parent directory plus `<workspace-basename>-<sanitized-branch>`.
 * @param workspacePath - Canonical main worktree (workspace) directory.
 * @param branch - Short branch name the new worktree checks out.
 * @returns the absolute default sibling path.
 */
export function siblingPath(workspacePath, branch) {
    return resolve(dirname(workspacePath), `${basename(workspacePath)}-${sanitizeBranch(branch)}`);
}
const sanitizeBranch = (branch) => {
    const cleaned = branch.replace(/[^0-9A-Za-z._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
    return cleaned.slice(0, MAX_BRANCH_SEGMENT_LENGTH) || 'worktree';
};
const parseWorktreeList = (stdout) => stdout.split(/\n\s*\n/).flatMap(block => {
    const lines = block.split('\n').filter(line => line.length > 0);
    const pathLine = lines.find(line => line.startsWith('worktree '));
    if (pathLine === undefined)
        return [];
    const branchLine = lines.find(line => line.startsWith('branch '));
    const branch = branchLine === undefined
        ? null
        : branchLine.slice('branch '.length).replace(/^refs\/heads\//, '');
    return [{ path: pathLine.slice('worktree '.length), branch, detached: lines.includes('detached') }];
});
/**
 * Git worktree command seam. One concrete service over {@link WorktreeGit}
 * `ctx.subprocess`; there is no swappable backend because every worktree
 * command is a local git invocation.
 */
export class WorktreeGit extends Service {
    static inject = ['subprocess'];
    constructor(ctx) {
        super(ctx, 'worktreeGit');
    }
    /**
     * Whether an existing directory is inside a git worktree. A missing git
     * executable or any git failure answers false — this is the discovery
     * guard, not a diagnostic.
     * @param path - Existing directory, in any spelling.
     * @returns true when `git rev-parse --is-inside-work-tree` succeeds.
     */
    async isGitRepo(path) {
        try {
            const result = await this.runGit(path, ['rev-parse', '--is-inside-work-tree']);
            return result.exitCode === 0 && result.stdout.trim() === 'true';
        }
        catch {
            return false;
        }
    }
    /**
     * The worktree root containing a directory: the checkout root for a main
     * worktree, the linked worktree directory otherwise.
     * @param path - Existing directory inside a worktree.
     * @returns the worktree root, or undefined when the command fails.
     */
    async worktreeRoot(path) {
        const result = await this.runGit(path, ['rev-parse', '--show-toplevel']);
        if (result.exitCode !== 0)
            return undefined;
        return result.stdout.trim();
    }
    /**
     * Short branch name checked out at a directory, or undefined when HEAD is
     * detached or the directory is not inside a worktree.
     * @param path - Existing directory inside a worktree.
     * @returns the short branch name (`refs/heads/` stripped).
     */
    async currentBranch(path) {
        const result = await this.runGit(path, ['symbolic-ref', '--short', 'HEAD']);
        if (result.exitCode !== 0)
            return undefined;
        return result.stdout.trim();
    }
    /**
     * Every worktree of the repository containing a directory, in `git
     * worktree list` order: the main worktree first, then linked worktrees.
     * @param path - Existing directory inside a worktree.
     * @returns parsed porcelain entries.
     * @throws {GitCommandError} when git fails (for example the path is not inside a worktree).
     */
    async listWorktrees(path) {
        const result = await this.runGit(path, ['worktree', 'list', '--porcelain']);
        if (result.exitCode !== 0) {
            throw new GitCommandError(`cannot list worktrees of '${path}': git failed with exit ${result.exitCode}`, ['git', '-C', path, 'worktree', 'list', '--porcelain'], path, result.exitCode, result.stderr);
        }
        return parseWorktreeList(result.stdout);
    }
    /**
     * Create a linked worktree on a NEW branch at the default sibling path
     * (see {@link siblingPath}). A free suffix (`-2`, `-3`, …) is appended when
     * the default path already exists.
     * @param workspacePath - Canonical main worktree (workspace) directory.
     * @param branch - Short branch name for the new worktree; must not exist yet.
     * @returns the created worktree entry.
     * @throws {GitCommandError} when git rejects the creation (for example the branch already exists).
     */
    async addWorktree(workspacePath, branch) {
        const target = this.availableSiblingPath(workspacePath, branch);
        const argv = ['worktree', 'add', target, '-b', branch];
        const result = await this.runGit(workspacePath, argv);
        if (result.exitCode !== 0) {
            throw new GitCommandError(`cannot create worktree on branch '${branch}' in '${workspacePath}': git failed with exit ${result.exitCode}`, ['git', '-C', workspacePath, ...argv], workspacePath, result.exitCode, result.stderr);
        }
        return { path: target, branch, detached: false };
    }
    /**
     * Remove a linked worktree directory and its git metadata, always with
     * `--force` (uncommitted changes and a locked worktree are discarded). The
     * main worktree can never be removed.
     * @param workspacePath - Canonical main worktree (workspace) directory.
     * @param worktreePath - Linked worktree directory to remove.
     * @returns resolution after git confirmed removal.
     * @throws {GitCommandError} when git rejects the removal.
     */
    async removeWorktree(workspacePath, worktreePath) {
        const argv = ['worktree', 'remove', '--force', worktreePath];
        const result = await this.runGit(workspacePath, argv);
        if (result.exitCode !== 0) {
            throw new GitCommandError(`cannot remove worktree '${worktreePath}': git failed with exit ${result.exitCode}`, ['git', '-C', workspacePath, ...argv], workspacePath, result.exitCode, result.stderr);
        }
    }
    availableSiblingPath(workspacePath, branch) {
        const base = siblingPath(workspacePath, branch);
        for (let attempt = 0; attempt < MAX_SIBLING_ATTEMPTS; attempt++) {
            const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
            if (!existsSync(candidate))
                return candidate;
        }
        throw new Error(`no free sibling path under '${dirname(base)}' for branch '${branch}'`);
    }
    async runGit(path, args) {
        const argv = ['git', '-C', path, ...args];
        const handle = this.ctx.subprocess.spawn({
            argv,
            cwd: path,
            stdio: { stdin: 'ignore', stdout: collect, stderr: collect },
            graceMs: GIT_GRACE_MS,
        });
        let outcome;
        try {
            outcome = await handle.done;
        }
        catch (error) {
            throw new GitCommandError(`failed to run git in '${path}': ${String(error)}`, argv, path, 1, '');
        }
        const stdout = handle.collected.stdout?.readFrom(0).text ?? '';
        const stderr = handle.collected.stderr?.readFrom(0).text ?? '';
        return { exitCode: outcome.exitCode ?? 1, stdout, stderr };
    }
}
export default WorktreeGit;
