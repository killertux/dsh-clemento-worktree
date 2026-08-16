/**
 * The worktree domain declaration: record schema and the `defineDomain` spec
 * the registry opens. The zod schema is the durable-boundary validator.
 * @module @deepseek-ai/dsh-worktree/src/spec
 */
import { z } from 'zod';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { WorktreeId } from './types.ts';
/**
 * Durable shape of one worktree record. `path` is the `fs.realpath` canon
 * stamped at creation (the workspace path for the main worktree, the linked
 * directory otherwise); `sessionIds` is the ordered ownership account (array
 * order is display order); timestamps are ISO-8601 strings.
 */
export declare const worktreeRecord: z.ZodObject<{
    workspaceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("@deepseek-ai/dsh-workspace/types").WorkspaceId, string>>;
    path: z.ZodString;
    name: z.ZodString;
    isMain: z.ZodBoolean;
    sessionIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
/** One stored worktree record, inferred from {@link worktreeRecord}. */
export type WorktreeRecord = z.infer<typeof worktreeRecord>;
/**
 * Durable registry state. `initialized` distinguishes a valid empty registry
 * from one that still needs the header-only history bootstrap;
 * `worktreeIds` is the authoritative display order.
 */
export declare const worktreeDomainState: z.ZodObject<{
    initialized: z.ZodBoolean;
    worktreeIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<WorktreeId, string>>>;
    pendingMutation: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        operation: z.ZodLiteral<"create">;
        worktreeId: z.ZodPipe<z.ZodString, z.ZodTransform<WorktreeId, string>>;
    }, z.core.$strip>, z.ZodObject<{
        operation: z.ZodLiteral<"delete">;
        worktreeId: z.ZodPipe<z.ZodString, z.ZodTransform<WorktreeId, string>>;
    }, z.core.$strip>], "operation">>;
}, z.core.$strip>;
/** Durable registry state inferred from {@link worktreeDomainState}. */
export type WorktreeDomainState = z.infer<typeof worktreeDomainState>;
/**
 * The worktree domain spec: one `worktrees` table keyed by {@link WorktreeId}
 * plus the bootstrap/order singleton. A distinct domain name from
 * `workspace`, so a plugin mounts it beside the workspace registry without a
 * single-open conflict.
 */
export declare const worktreeDomainSpec: {
    name: string;
    version: number;
    global: {
        schema: z.ZodObject<{
            initialized: z.ZodBoolean;
            worktreeIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<WorktreeId, string>>>;
            pendingMutation: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
                operation: z.ZodLiteral<"create">;
                worktreeId: z.ZodPipe<z.ZodString, z.ZodTransform<WorktreeId, string>>;
            }, z.core.$strip>, z.ZodObject<{
                operation: z.ZodLiteral<"delete">;
                worktreeId: z.ZodPipe<z.ZodString, z.ZodTransform<WorktreeId, string>>;
            }, z.core.$strip>], "operation">>;
        }, z.core.$strip>;
        initial: {
            initialized: boolean;
            worktreeIds: never[];
        };
    };
    tables: {
        worktrees: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<WorktreeId, {
            workspaceId: import("@deepseek-ai/dsh-workspace/types").WorkspaceId;
            path: string;
            name: string;
            isMain: boolean;
            sessionIds: SessionId[];
            createdAt: string;
            updatedAt: string;
        }>;
    };
};
