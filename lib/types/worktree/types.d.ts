/**
 * Public type vocabulary of the worktree entity: the `WorktreeId` brand, the
 * `Worktree` consumer interface, and the `WorktreeView` wire projection.
 * Types only — the `WorktreeId` factory lives in `index.ts`. Remote-boundary
 * types live here so the typert generator can reference a public non-root
 * type subpath.
 * @module @deepseek-ai/dsh-worktree/src/types
 */
import type { Branded } from '@deepseek-ai/dsh-brand';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types';
/**
 * Identifies one worktree record. A generated uuid, never the path: path
 * normalization rewrites paths, and a reference anchor must stay stable.
 */
export type WorktreeId = Branded<'WorktreeId'>;
/** One worktree row: the record projection every `worktree.*` remote value carries. */
export interface WorktreeView {
    worktreeId: WorktreeId;
    workspaceId: WorkspaceId;
    /** Canonical directory path (host-side realpath canon). */
    path: string;
    /** Display name: the checked-out branch, or "(detached)". */
    name: string;
    /** True for the workspace's own directory (the main worktree). */
    isMain: boolean;
    /** Sessions accounted under this worktree, in manual order. */
    sessionIds: SessionId[];
    /** ISO-8601 creation instant. */
    createdAt: string;
    /** ISO-8601 last-mutation instant. */
    updatedAt: string;
}
/** worktree.list request: the owning workspace. */
export interface WorktreeListRequest {
    workspaceId: WorkspaceId;
}
/** worktree.list / worktree.discover result. */
export interface WorktreeListResult {
    items: WorktreeView[];
}
/** worktree.create request: the owning workspace and the new branch name. */
export interface WorktreeCreateRequest {
    workspaceId: WorkspaceId;
    branch: string;
}
/** worktree.create result. */
export interface WorktreeCreateResult {
    worktree: WorktreeView;
}
/** worktree.delete request. */
export interface WorktreeDeleteRequest {
    workspaceId: WorkspaceId;
    worktreeId: WorktreeId;
}
/** worktree.delete result. */
export interface WorktreeDeleteResult {
    deleted: boolean;
}
/** worktree.resolve request: a directory path in any spelling. */
export interface WorktreeResolveRequest {
    cwd: string;
}
/** worktree.bySession request: the session to locate. */
export interface WorktreeBySessionRequest {
    sessionId: SessionId;
}
/** worktree.resolve / worktree.bySession result; null when nothing matches. */
export interface WorktreeResolveResult {
    worktree: WorktreeView | null;
}
/** worktree.mapBySessions request: sessions whose owning workspace to resolve. */
export interface WorktreeMapSessionsRequest {
    sessionIds: SessionId[];
}
/** worktree.mapBySessions result: session id → owning workspace id. */
export interface WorktreeMapSessionsResult {
    mappings: Record<string, WorkspaceId>;
}
/**
 * One worktree: a durable record of a git worktree directory owned by a
 * workspace, with an ordered session account. The main worktree (the
 * workspace's own directory) has `isMain: true` and `path` equal to its
 * workspace path; every other record is a linked worktree discovered from
 * `git worktree list` or created through the registry.
 */
export interface Worktree {
    /** Stable record id (generated uuid). */
    readonly id: WorktreeId;
    /** Owning workspace record id. */
    readonly workspaceId: WorkspaceId;
    /** Canonical directory path (the `fs.realpath` canon). */
    readonly path: string;
    /** Display name: the checked-out branch, or "(detached)". */
    readonly name: string;
    /** True for the workspace's own directory (the main worktree). */
    readonly isMain: boolean;
    /** ISO-8601 creation instant. */
    readonly createdAt: string;
    /** ISO-8601 last-mutation instant. */
    readonly updatedAt: string;
    /**
     * Header-validated sessions in manual order: membership requires both a
     * slot in the durable account and a session header whose canonical cwd
     * equals {@link path}.
     */
    readonly sessionIds: readonly SessionId[];
    /** Replace the display name durably. */
    setName(name: string): Promise<void>;
    /**
     * Prepend a session to this worktree's account. A new id's live or
     * persisted header cwd must resolve to an existing directory equal to
     * {@link path}; unknown ids, missing or invalid cwd values, and mismatches
     * reject without writing.
     */
    attachSession(sessionId: SessionId): Promise<void>;
    /** Move an accounted session within the manual order, DOM-insertBefore-like. */
    insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>;
    /** Remove a session from this worktree's account. */
    detachSession(sessionId: SessionId): Promise<void>;
    /** Live directory check: whether {@link path} currently exists. */
    status(): Promise<'ok' | 'missing-dir'>;
}
