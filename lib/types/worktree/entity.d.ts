/**
 * Package-private worktree entity: the single {@link Worktree} implementation.
 * Holds a record snapshot that is swapped in place after each durable
 * mutation; every write funnels through the private `mutate` so `updatedAt`
 * stamping and invalid-account pruning happen exactly once. Not re-exported
 * from the package entrypoint — consumers see only the {@link Worktree}
 * interface.
 * @module @deepseek-ai/dsh-worktree/src/entity
 */
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session';
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import { type WorkspaceId } from '@deepseek-ai/dsh-workspace';
import type { WorktreeRecord } from './spec.ts';
import type { Worktree, WorktreeId } from './types.ts';
/** An insertSessionBefore request named a session or anchor not on the account. */
export declare class WorktreeMoveInvalidError extends Error {
    /**
     * @param message - Which id was unaccounted and where.
     */
    constructor(message: string);
}
/**
 * The registry-owned machinery an entity mutates through. Entities never see
 * the registry itself — only the open table and the canonical session-path
 * index backing the `sessionIds` projection.
 */
export interface WorktreeEntityHost {
    /** Resolve the open `worktrees` table. */
    table(): KvTable<WorktreeId, WorktreeRecord>;
    /** Read a session's canonical directory from the registry's header index. */
    sessionPath(id: SessionId): string | undefined;
    /** Read one stored session header for attach validation. */
    readSessionHeader(id: SessionId): Promise<SessionHeader>;
    /** Publish a successfully validated canonical cwd to the projection index. */
    rememberSessionPath(id: SessionId, path: string): void;
}
/** The single {@link Worktree} implementation; constructed only by the registry. */
export declare class WorktreeEntity implements Worktree {
    private readonly host;
    readonly id: WorktreeId;
    private record;
    /**
     * @param host - Registry-owned table and session-path index.
     * @param id - The record's stable id.
     * @param record - The validated record snapshot loaded or just written.
     */
    constructor(host: WorktreeEntityHost, id: WorktreeId, record: WorktreeRecord);
    get workspaceId(): WorkspaceId;
    get path(): string;
    get name(): string;
    get isMain(): boolean;
    get createdAt(): string;
    get updatedAt(): string;
    get sessionIds(): readonly SessionId[];
    setName(name: string): Promise<void>;
    attachSession(sessionId: SessionId): Promise<void>;
    insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>;
    detachSession(sessionId: SessionId): Promise<void>;
    status(): Promise<'ok' | 'missing-dir'>;
    /**
     * The single write path: run `fn` on the domain write chain via
     * `table.update`, stamping `updatedAt` and pruning candidates that no
     * longer pass the id-plus-canonical-cwd membership check, then swap the
     * snapshot.
     */
    private mutate;
}
