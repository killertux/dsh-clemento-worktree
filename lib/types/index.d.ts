/**
 * Git worktree subdivision for DeepSeek Harness — package root plugin.
 *
 * One Loader entry mounts the whole feature: the git command seam
 * (`ctx.worktreeGit`) and the worktree registry (`ctx.worktreeRegistry`, a
 * typert remote). The `dsh.client` manifest in package.json registers the
 * browser half (the worktree badge and the new-session-in-worktree flow).
 * Non-git workspaces are untouched: no worktree records, no badge.
 */
import { Context } from '@deepseek-ai/cordis';
export type { Worktree, WorktreeView } from './worktree/types.ts';
export { worktreeDomainState, worktreeRecord, worktreeDomainSpec } from './worktree/spec.ts';
export type { WorktreeDomainState, WorktreeRecord } from './worktree/spec.ts';
export { WorktreeMoveInvalidError } from './worktree/entity.ts';
export type { GitWorktreeEntry } from './git/types.ts';
/** Cordis plugin name (the single bundle row). */
export declare const name = "worktree";
/** Host services the registry needs before the feature can start. */
export declare const inject: string[];
/**
 * Mount the git seam then the registry. The registry's own inject resolves
 * `worktreeGit` from the seam mounted first.
 * @param ctx - host cordis context.
 */
export declare function apply(ctx: Context): Promise<void>;
