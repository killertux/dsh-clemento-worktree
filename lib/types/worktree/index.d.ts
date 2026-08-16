/**
 * Worktree registry (`ctx.worktreeRegistry`): durable git-worktree records per
 * workspace, session accounting by canonical cwd, and the typert remote face
 * the browser consumes. The main worktree is the workspace's own directory;
 * linked worktrees are discovered from `git worktree list` or created through
 * this registry. Mounts beside the workspace registry in its own domain.
 * @module @deepseek-ai/dsh-worktree
 */
import { Context, Service } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Worktree, WorktreeBySessionRequest, WorktreeMapSessionsRequest, WorktreeMapSessionsResult, WorktreeCreateRequest, WorktreeCreateResult, WorktreeDeleteRequest, WorktreeDeleteResult, WorktreeId as WorktreeIdBrand, WorktreeListRequest, WorktreeListResult, WorktreeResolveRequest, WorktreeResolveResult } from './types.ts';
export type { Worktree, WorktreeView, WorktreeMapSessionsRequest, WorktreeMapSessionsResult, WorktreeBySessionRequest, WorktreeCreateRequest, WorktreeCreateResult, WorktreeDeleteRequest, WorktreeDeleteResult, WorktreeListRequest, WorktreeListResult, WorktreeResolveRequest, WorktreeResolveResult, } from './types.ts';
export { worktreeDomainState, worktreeRecord, worktreeDomainSpec } from './spec.ts';
export type { WorktreeDomainState, WorktreeRecord } from './spec.ts';
export { WorktreeMoveInvalidError } from './entity.ts';
/** Identifies one worktree record (see `src/types.ts` for the brand rationale). */
export type WorktreeId = WorktreeIdBrand;
/**
 * Brand a string as a {@link WorktreeId}.
 * @param id - Raw worktree id string.
 * @returns the same string, branded at compile time.
 */
export declare function WorktreeId(id: string): WorktreeId;
declare module '@deepseek-ai/cordis' {
    interface Context {
        worktreeRegistry: WorktreeRegistry;
    }
}
/**
 * Durable worktree registry. Startup waits for session persistence and the
 * workspace registry, indexes session headers by canonical cwd, and mints
 * main-worktree records for git workspaces before the service becomes
 * active. Live session creation is adopted through `session/created`.
 */
export declare class WorktreeRegistry extends TypertRemoteService {
    static inject: string[];
    private table?;
    private global?;
    private state?;
    private readonly entities;
    private readonly headers;
    private readonly sessionPaths;
    private readonly invalidSessionPaths;
    private operationTail;
    private readonly host;
    constructor(ctx: Context);
    /** Open the domain, finish bootstrap when required, and rebuild the cache. */
    protected [Service.init](): Promise<void>;
    /**
     * The wire read face: durable worktree records of one workspace, main
     * worktree first, in registry order.
     * @param request - the owning workspace.
     * @returns the workspace's worktree views.
     */
    list(request: WorktreeListRequest): Promise<WorktreeListResult>;
    /**
     * Create a linked worktree on a NEW branch: runs `git worktree add` at the
     * default sibling path, then records the resulting directory durably.
     * @param request - the owning workspace (must be a git worktree) and the new branch name.
     * @returns the created worktree view.
     * @throws when the workspace is not a git worktree or git rejects the branch.
     */
    create(request: WorktreeCreateRequest): Promise<WorktreeCreateResult>;
    /**
     * Remove a linked worktree: runs `git worktree remove --force`, then deletes
     * the durable record. The main worktree can never be removed.
     * @param request - the owning workspace and the linked worktree to remove.
     * @returns `deleted: true` when a record was deleted, `false` when it was unknown.
     */
    delete(request: WorktreeDeleteRequest): Promise<WorktreeDeleteResult>;
    /**
     * Re-sync durable records with `git worktree list`: adopt newly discovered
     * linked worktrees and prune records whose directory git no longer lists.
     * @param request - the owning workspace.
     * @returns the refreshed worktree views.
     */
    discover(request: WorktreeListRequest): Promise<WorktreeListResult>;
    /**
     * The worktree containing a directory, for the session badge: any cwd maps
     * to at most one registered worktree path.
     * @param request - a directory path in any spelling.
     * @returns the matching worktree view, or null when none matches.
     */
    resolve(request: WorktreeResolveRequest): Promise<WorktreeResolveResult>;
    /**
     * The worktree accounting a session, resolving the session's header cwd
     * on demand when the index has not seen it yet.
     * @param request - the session to locate.
     * @returns the worktree view, or null when the session is in no worktree.
     */
    bySession(request: WorktreeBySessionRequest): Promise<WorktreeResolveResult>;
    /**
     * The owning workspace of each indexed session whose cwd matches a
     * registered worktree, for the sidebar grouping of worktree sessions.
     * @param request - sessions to map.
     * @returns session id → owning workspace id (indexed sessions only).
     */
    mapBySessions(request: WorktreeMapSessionsRequest): Promise<WorktreeMapSessionsResult>;
    /**
     * Look up a worktree by id.
     * @param id - Worktree id.
     * @returns the worktree, or `undefined` when unknown.
     */
    get(id: WorktreeId): Worktree | undefined;
    private bootstrap;
    /**
     * Mint the main worktree of a git workspace (when absent) and re-sync
     * linked worktrees from `git worktree list`. Non-git workspaces are
     * untouched. Runs on startup bootstrap and when a workspace is registered
     * while this registry is live.
     */
    private ensureForWorkspace;
    /** Adopt every indexed session whose cwd matches a registered worktree (idempotent). */
    private adoptIndexedSessions;
    /**
     * Adopt one session into the worktree matching its cwd, if any. Failures
     * are silent: an unresolvable or mismatched cwd simply means no worktree
     * accounts this session.
     */
    private adoptSession;
    private byPath;
    private listViews;
    private view;
    private requireWorkspace;
    private createRecord;
    private deleteRecord;
    /**
     * Complete the one mutation explicitly named by durable state. Unexplained
     * order/table divergence still reaches {@link validateStoredState} and
     * fails loud.
     */
    private recoverPendingMutation;
    private validateStoredState;
    private rebuildEntities;
    private replaceHeaderIndex;
    private indexHeaders;
    private indexHeader;
    private indexLiveSessions;
    private readSessionHeader;
    private requireTable;
    private requireState;
    private setState;
    private enqueueOperation;
}
export default WorktreeRegistry;
