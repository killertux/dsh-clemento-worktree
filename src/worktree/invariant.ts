/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-worktree`.
 * @module @deepseek-ai/dsh-worktree/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import { WorktreeId } from './index.ts'

const PACKAGE_NAME = '@killertux/dsh-clemento-worktree'

/** Cordis companion plugin name. */
export const name = 'worktree-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Owned relationship: the registry's entity cache mirrors the worktree
 * domain's durable table. Every `domain/changed` for the `worktrees` table
 * must name a record the cache already holds an entity for (the registry
 * caches before the durable put and mutates only through cached entities).
 * A delete is valid only after the registry has removed the entity from its
 * cache.
 */
const install: InvariantInstaller = Object.assign(
  (ctx: Context, fail: (message: string) => never) => {
    ctx.on('domain/changed', (change: DomainChanged) => {
      if (change.domain !== 'worktree' || change.table !== 'worktrees') return
      if (change.operation === 'deleted') {
        if (ctx.worktreeRegistry.get(WorktreeId(change.key)) !== undefined) {
          fail(
            `worktree record '${change.key}' was deleted while the registry cache still `
            + 'publishes it — some write path bypassed ctx.worktreeRegistry',
          )
        }
        return
      }
      if (ctx.worktreeRegistry.get(WorktreeId(change.key)) === undefined) {
        fail(
          `worktree record '${change.key}' landed durably but the registry cache holds `
          + 'no entity for it — the cache and the domain table have diverged',
        )
      }
    })
  },
  { inject: ['worktreeRegistry'] },
)

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
