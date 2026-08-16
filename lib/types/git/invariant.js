/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-worktree-git`.
 * @module @deepseek-ai/dsh-worktree-git/invariant
 */
const PACKAGE_NAME = '@killertux/dsh-clemento-worktree';
/** Cordis companion plugin name. */
export const name = 'worktree-git-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/**
 * No runtime invariant: this pure command seam owns no event stream or
 * mutable runtime data; git's own behavior and the porcelain parser are
 * enforced by unit tests against real repositories.
 */
const install = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
/* jscpd:ignore-end */
