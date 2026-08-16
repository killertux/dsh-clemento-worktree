/**
 * The worktree domain declaration: record schema and the `defineDomain` spec
 * the registry opens. The zod schema is the durable-boundary validator.
 * @module @deepseek-ai/dsh-worktree/src/spec
 */
import { z } from 'zod';
import { SessionId } from '@deepseek-ai/dsh-session';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
/** Worktree id schema at the durable boundary; branding has no runtime representation. */
const worktreeId = z.string().transform(value => value);
/** Workspace id schema at the durable boundary (structural twin of dsh-workspace's). */
const workspaceId = z.string().transform(value => value);
/**
 * Durable shape of one worktree record. `path` is the `fs.realpath` canon
 * stamped at creation (the workspace path for the main worktree, the linked
 * directory otherwise); `sessionIds` is the ordered ownership account (array
 * order is display order); timestamps are ISO-8601 strings.
 */
export const worktreeRecord = z.object({
    workspaceId,
    path: z.string(),
    name: z.string(),
    isMain: z.boolean(),
    sessionIds: z.array(z.string().transform(SessionId)),
    createdAt: z.string(),
    updatedAt: z.string(),
});
/**
 * Recoverable two-write mutation marker, mirroring the workspace domain: the
 * marker is persisted before the record/order pair can diverge, so startup
 * can distinguish an interrupted registry operation from corruption.
 */
const worktreePendingMutation = z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('create'), worktreeId }),
    z.object({ operation: z.literal('delete'), worktreeId }),
]);
/**
 * Durable registry state. `initialized` distinguishes a valid empty registry
 * from one that still needs the header-only history bootstrap;
 * `worktreeIds` is the authoritative display order.
 */
export const worktreeDomainState = z.object({
    initialized: z.boolean(),
    worktreeIds: z.array(worktreeId),
    pendingMutation: worktreePendingMutation.optional(),
});
/**
 * The worktree domain spec: one `worktrees` table keyed by {@link WorktreeId}
 * plus the bootstrap/order singleton. A distinct domain name from
 * `workspace`, so a plugin mounts it beside the workspace registry without a
 * single-open conflict.
 */
export const worktreeDomainSpec = defineDomain({
    name: 'worktree',
    version: 1,
    global: {
        schema: worktreeDomainState,
        initial: { initialized: false, worktreeIds: [] },
    },
    tables: { worktrees: domainTable(worktreeRecord) },
});
