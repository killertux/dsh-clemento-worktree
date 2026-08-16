/**
 * Worktree registry (`ctx.worktreeRegistry`): durable git-worktree records per
 * workspace, session accounting by canonical cwd, and the typert remote face
 * the browser consumes. The main worktree is the workspace's own directory;
 * linked worktrees are discovered from `git worktree list` or created through
 * this registry. Mounts beside the workspace registry in its own domain.
 * @module @deepseek-ai/dsh-worktree
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { Service } from '@deepseek-ai/cordis';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { WorkspaceId } from '@deepseek-ai/dsh-workspace';
import { realpathNormalize } from '@deepseek-ai/dsh-workspace';
import { WorktreeEntity } from "./entity.js";
import { worktreeDomainSpec } from "./spec.js";
export { worktreeDomainState, worktreeRecord, worktreeDomainSpec } from "./spec.js";
export { WorktreeMoveInvalidError } from "./entity.js";
/**
 * Brand a string as a {@link WorktreeId}.
 * @param id - Raw worktree id string.
 * @returns the same string, branded at compile time.
 */
export function WorktreeId(id) {
    return id;
}
const DETACHED_NAME = '(detached)';
/**
 * Durable worktree registry. Startup waits for session persistence and the
 * workspace registry, indexes session headers by canonical cwd, and mints
 * main-worktree records for git workspaces before the service becomes
 * active. Live session creation is adopted through `session/created`.
 */
let WorktreeRegistry = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _create_decorators;
    let _delete_decorators;
    let _discover_decorators;
    let _resolve_decorators;
    let _bySession_decorators;
    let _mapBySessions_decorators;
    return class WorktreeRegistry extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote('list')];
            _create_decorators = [Remote('create')];
            _delete_decorators = [Remote('delete')];
            _discover_decorators = [Remote('discover')];
            _resolve_decorators = [Remote('resolve')];
            _bySession_decorators = [Remote('bySession')];
            _mapBySessions_decorators = [Remote('mapBySessions')];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _delete_decorators, { kind: "method", name: "delete", static: false, private: false, access: { has: obj => "delete" in obj, get: obj => obj.delete }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _discover_decorators, { kind: "method", name: "discover", static: false, private: false, access: { has: obj => "discover" in obj, get: obj => obj.discover }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _resolve_decorators, { kind: "method", name: "resolve", static: false, private: false, access: { has: obj => "resolve" in obj, get: obj => obj.resolve }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _bySession_decorators, { kind: "method", name: "bySession", static: false, private: false, access: { has: obj => "bySession" in obj, get: obj => obj.bySession }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _mapBySessions_decorators, { kind: "method", name: "mapBySessions", static: false, private: false, access: { has: obj => "mapBySessions" in obj, get: obj => obj.mapBySessions }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['storageDomain', 'sessionPersistence', 'worktreeGit', 'workspaceRegistry'];
        table = __runInitializers(this, _instanceExtraInitializers);
        global;
        state;
        entities = new Map();
        headers = new Map();
        sessionPaths = new Map();
        invalidSessionPaths = new Map();
        operationTail = Promise.resolve();
        host = {
            table: () => this.requireTable(),
            sessionPath: id => this.sessionPaths.get(id),
            readSessionHeader: id => this.readSessionHeader(id),
            rememberSessionPath: (id, path) => {
                this.sessionPaths.set(id, path);
                this.invalidSessionPaths.delete(id);
            },
        };
        constructor(ctx) {
            super(ctx, 'worktreeRegistry');
            // Adopt every newly created session whose cwd matches a registered
            // worktree. The registry stays authoritative for worktree membership
            // without touching the workspace/session creation path.
            ctx.on('session/created', session => {
                void this.adoptSession(session.id, session.header.cwd);
            });
            // Ensure worktrees for workspaces registered after this registry booted:
            // a new workspace record landing in the workspace domain triggers the
            // same main-worktree mint + git discovery as startup bootstrap.
            ctx.on('domain/changed', change => {
                if (change.domain !== 'workspace' || change.table !== 'workspaces' || change.operation !== 'put')
                    return;
                if (this.state === undefined)
                    return; // this registry not started yet
                const workspace = ctx.workspaceRegistry.get(WorkspaceId(change.key));
                if (workspace !== undefined)
                    void this.ensureForWorkspace(workspace);
            });
        }
        /** Open the domain, finish bootstrap when required, and rebuild the cache. */
        async [Service.init]() {
            const domain = await this.ctx.storageDomain.open(worktreeDomainSpec);
            this.ctx.effect(() => () => domain.close(), 'worktree.domainClose');
            this.table = domain.table('worktrees');
            this.global = domain.global;
            this.state = domain.global.get();
            await this.recoverPendingMutation();
            this.validateStoredState(this.state);
            await this.replaceHeaderIndex(await this.ctx.sessionPersistence.list());
            if (!this.state.initialized) {
                await this.bootstrap();
            }
            await this.indexLiveSessions();
            this.validateStoredState(this.requireState());
            this.rebuildEntities();
            await this.adoptIndexedSessions();
        }
        /**
         * The wire read face: durable worktree records of one workspace, main
         * worktree first, in registry order.
         * @param request - the owning workspace.
         * @returns the workspace's worktree views.
         */
        async list(request) {
            const workspaceId = request.workspaceId;
            this.requireWorkspace(workspaceId);
            return { items: this.listViews(workspaceId) };
        }
        /**
         * Create a linked worktree on a NEW branch: runs `git worktree add` at the
         * default sibling path, then records the resulting directory durably.
         * @param request - the owning workspace (must be a git worktree) and the new branch name.
         * @returns the created worktree view.
         * @throws when the workspace is not a git worktree or git rejects the branch.
         */
        async create(request) {
            const { workspaceId, branch } = request;
            const workspace = this.requireWorkspace(workspaceId);
            if (!await this.ctx.worktreeGit.isGitRepo(workspace.path)) {
                throw new Error(`cannot create a worktree: '${workspace.path}' is not a git worktree`);
            }
            const entry = await this.ctx.worktreeGit.addWorktree(workspace.path, branch);
            const canonical = await realpathNormalize(entry.path);
            const entity = await this.enqueueOperation(() => this.createRecord(workspaceId, canonical, branch, false));
            return { worktree: this.view(entity) };
        }
        /**
         * Remove a linked worktree: runs `git worktree remove --force`, then deletes
         * the durable record. The main worktree can never be removed.
         * @param request - the owning workspace and the linked worktree to remove.
         * @returns `deleted: true` when a record was deleted, `false` when it was unknown.
         */
        async delete(request) {
            const { workspaceId, worktreeId } = request;
            const entity = this.entities.get(worktreeId);
            if (entity === undefined)
                return { deleted: false };
            if (entity.workspaceId !== workspaceId) {
                throw new Error(`worktree '${worktreeId}' does not belong to workspace '${workspaceId}'`);
            }
            if (entity.isMain)
                throw new Error('the main worktree cannot be removed');
            const workspace = this.requireWorkspace(workspaceId);
            await this.ctx.worktreeGit.removeWorktree(workspace.path, entity.path);
            await this.enqueueOperation(() => this.deleteRecord(worktreeId));
            return { deleted: true };
        }
        /**
         * Re-sync durable records with `git worktree list`: adopt newly discovered
         * linked worktrees and prune records whose directory git no longer lists.
         * @param request - the owning workspace.
         * @returns the refreshed worktree views.
         */
        async discover(request) {
            const workspaceId = request.workspaceId;
            const workspace = this.requireWorkspace(workspaceId);
            const entries = await this.ctx.worktreeGit.listWorktrees(workspace.path);
            const seen = new Set();
            for (const entry of entries) {
                const canonical = await realpathNormalize(entry.path);
                if (canonical === workspace.path)
                    continue; // the main worktree is ensured separately
                seen.add(canonical);
                if (this.byPath(canonical) !== undefined)
                    continue;
                const name = entry.branch ?? DETACHED_NAME;
                await this.enqueueOperation(() => this.createRecord(workspaceId, canonical, name, false));
            }
            for (const entity of [...this.entities.values()]) {
                if (entity.workspaceId !== workspaceId || entity.isMain)
                    continue;
                if (!seen.has(entity.path)) {
                    await this.enqueueOperation(() => this.deleteRecord(entity.id));
                }
            }
            return { items: this.listViews(workspaceId) };
        }
        /**
         * The worktree containing a directory, for the session badge: any cwd maps
         * to at most one registered worktree path.
         * @param request - a directory path in any spelling.
         * @returns the matching worktree view, or null when none matches.
         */
        async resolve(request) {
            let canonical;
            try {
                canonical = await realpathNormalize(request.cwd);
            }
            catch {
                return { worktree: null };
            }
            const entity = this.byPath(canonical);
            return { worktree: entity === undefined ? null : this.view(entity) };
        }
        /**
         * The worktree accounting a session, resolving the session's header cwd
         * on demand when the index has not seen it yet.
         * @param request - the session to locate.
         * @returns the worktree view, or null when the session is in no worktree.
         */
        async bySession(request) {
            const sessionId = request.sessionId;
            if (this.sessionPaths.has(sessionId) === false) {
                try {
                    const header = await this.readSessionHeader(sessionId);
                    if (header.cwd !== undefined)
                        await this.adoptSession(sessionId, header.cwd);
                }
                catch {
                    return { worktree: null };
                }
            }
            const path = this.sessionPaths.get(sessionId);
            if (path === undefined)
                return { worktree: null };
            const entity = this.byPath(path);
            return { worktree: entity === undefined ? null : this.view(entity) };
        }
        /**
         * The owning workspace of each indexed session whose cwd matches a
         * registered worktree, for the sidebar grouping of worktree sessions.
         * @param request - sessions to map.
         * @returns session id → owning workspace id (indexed sessions only).
         */
        async mapBySessions(request) {
            const mappings = {};
            for (const sessionId of request.sessionIds) {
                const path = this.sessionPaths.get(sessionId);
                if (path === undefined)
                    continue;
                const entity = this.byPath(path);
                if (entity !== undefined)
                    mappings[String(sessionId)] = entity.workspaceId;
            }
            return { mappings };
        }
        /**
         * Look up a worktree by id.
         * @param id - Worktree id.
         * @returns the worktree, or `undefined` when unknown.
         */
        get(id) {
            return this.entities.get(id);
        }
        async bootstrap() {
            for (const workspace of this.ctx.workspaceRegistry.list()) {
                await this.ensureForWorkspace(workspace);
            }
            await this.setState({ ...this.requireState(), initialized: true });
        }
        /**
         * Mint the main worktree of a git workspace (when absent) and re-sync
         * linked worktrees from `git worktree list`. Non-git workspaces are
         * untouched. Runs on startup bootstrap and when a workspace is registered
         * while this registry is live.
         */
        async ensureForWorkspace(workspace) {
            if (!await this.ctx.worktreeGit.isGitRepo(workspace.path))
                return;
            if (this.byPath(workspace.path) === undefined) {
                const branch = await this.ctx.worktreeGit.currentBranch(workspace.path);
                await this.enqueueOperation(() => this.createRecord(workspace.id, workspace.path, branch ?? DETACHED_NAME, true));
            }
            await this.discover({ workspaceId: workspace.id });
        }
        /** Adopt every indexed session whose cwd matches a registered worktree (idempotent). */
        async adoptIndexedSessions() {
            for (const [sessionId, path] of [...this.sessionPaths]) {
                const entity = this.byPath(path);
                if (entity !== undefined)
                    await entity.attachSession(sessionId);
            }
        }
        /**
         * Adopt one session into the worktree matching its cwd, if any. Failures
         * are silent: an unresolvable or mismatched cwd simply means no worktree
         * accounts this session.
         */
        async adoptSession(sessionId, cwd) {
            if (cwd === undefined)
                return;
            let canonical;
            try {
                canonical = await realpathNormalize(cwd);
                if (!(await stat(canonical)).isDirectory())
                    return;
            }
            catch {
                return;
            }
            this.sessionPaths.set(sessionId, canonical);
            this.invalidSessionPaths.delete(sessionId);
            const entity = this.byPath(canonical);
            if (entity !== undefined)
                await entity.attachSession(sessionId);
        }
        byPath(path) {
            for (const entity of this.entities.values()) {
                if (entity.path === path)
                    return entity;
            }
            return undefined;
        }
        listViews(workspaceId) {
            const main = [...this.entities.values()]
                .filter(entity => entity.workspaceId === workspaceId && entity.isMain)
                .map(entity => this.view(entity));
            const linked = this.requireState().worktreeIds
                .map(id => this.entities.get(id))
                .filter((entity) => entity !== undefined && entity.workspaceId === workspaceId && !entity.isMain)
                .map(entity => this.view(entity));
            return [...main, ...linked];
        }
        view(entity) {
            return {
                worktreeId: entity.id,
                workspaceId: entity.workspaceId,
                path: entity.path,
                name: entity.name,
                isMain: entity.isMain,
                sessionIds: [...entity.sessionIds],
                createdAt: entity.createdAt,
                updatedAt: entity.updatedAt,
            };
        }
        requireWorkspace(workspaceId) {
            const workspace = this.ctx.workspaceRegistry.get(workspaceId);
            if (workspace === undefined) {
                throw new Error(`cannot resolve workspace '${workspaceId}'`);
            }
            return workspace;
        }
        async createRecord(workspaceId, path, name, isMain) {
            const table = this.requireTable();
            const state = this.requireState();
            const id = WorktreeId(randomUUID());
            const now = new Date().toISOString();
            const record = {
                workspaceId,
                path,
                name,
                isMain,
                sessionIds: [],
                createdAt: now,
                updatedAt: now,
            };
            const entity = new WorktreeEntity(this.host, id, record);
            this.entities.set(id, entity);
            try {
                await this.setState({ ...state, pendingMutation: { operation: 'create', worktreeId: id } });
            }
            catch (error) {
                this.entities.delete(id);
                throw error;
            }
            try {
                await table.put(id, record);
            }
            catch (error) {
                this.entities.delete(id);
                try {
                    await this.setState(state);
                }
                catch (rollbackError) {
                    throw new AggregateError([error, rollbackError], `worktree '${id}' record write and pending-marker rollback both failed`);
                }
                throw error;
            }
            try {
                await this.setState({
                    initialized: true,
                    worktreeIds: [id, ...state.worktreeIds],
                });
            }
            catch (error) {
                this.entities.delete(id);
                try {
                    await table.delete(id);
                }
                catch (rollbackError) {
                    throw new AggregateError([error, rollbackError], `worktree '${id}' order write and record rollback both failed; the pending marker remains recoverable`);
                }
                try {
                    await this.setState(state);
                }
                catch (rollbackError) {
                    throw new AggregateError([error, rollbackError], `worktree '${id}' order write and pending-marker rollback both failed`);
                }
                throw error;
            }
            return entity;
        }
        async deleteRecord(id) {
            const entity = this.entities.get(id);
            if (entity === undefined)
                return false;
            const state = this.requireState();
            const nextState = {
                initialized: true,
                worktreeIds: state.worktreeIds.filter(worktreeId => worktreeId !== id),
            };
            await this.setState({ ...nextState, pendingMutation: { operation: 'delete', worktreeId: id } });
            this.entities.delete(id);
            try {
                await this.requireTable().delete(id);
            }
            catch (error) {
                this.entities.set(id, entity);
                try {
                    await this.setState(state);
                }
                catch (rollbackError) {
                    this.entities.delete(id);
                    throw new AggregateError([error, rollbackError], `worktree '${id}' record deletion and registry-order rollback both failed`);
                }
                throw error;
            }
            try {
                await this.setState(nextState);
            }
            catch (error) {
                this.ctx.logger.warn(`worktree '${id}' was deleted but its pending marker could not be cleared: ${String(error)}`);
            }
            return true;
        }
        /**
         * Complete the one mutation explicitly named by durable state. Unexplained
         * order/table divergence still reaches {@link validateStoredState} and
         * fails loud.
         */
        async recoverPendingMutation() {
            const state = this.requireState();
            const pending = state.pendingMutation;
            if (pending === undefined)
                return;
            if (state.worktreeIds.includes(pending.worktreeId)) {
                throw new Error(`worktree domain is inconsistent: pending ${pending.operation} worktree `
                    + `'${pending.worktreeId}' is still present in registry order`);
            }
            await this.requireTable().delete(pending.worktreeId);
            await this.setState({ initialized: state.initialized, worktreeIds: state.worktreeIds });
        }
        validateStoredState(state) {
            const table = this.requireTable();
            const order = new Set();
            for (const id of state.worktreeIds) {
                if (order.has(id)) {
                    throw new Error(`worktree domain is inconsistent: registry order repeats worktree '${id}'`);
                }
                if (table.get(id) === undefined) {
                    throw new Error(`worktree domain is inconsistent: registry order references missing worktree '${id}'`);
                }
                order.add(id);
            }
            if (state.initialized && order.size !== table.size) {
                const orphan = [...table.keys()].find(id => !order.has(id));
                throw new Error(`worktree domain is inconsistent: worktree '${orphan}' is absent from registry order`);
            }
            const paths = new Map();
            const accounted = new Map();
            const mainByWorkspace = new Map();
            for (const [id, record] of table.entries()) {
                const pathHolder = paths.get(record.path);
                if (pathHolder !== undefined) {
                    throw new Error(`worktree domain is inconsistent: path '${record.path}' is claimed `
                        + `by both worktree '${pathHolder}' and worktree '${id}'`);
                }
                paths.set(record.path, id);
                if (record.isMain) {
                    const mainHolder = mainByWorkspace.get(record.workspaceId);
                    if (mainHolder !== undefined) {
                        throw new Error(`worktree domain is inconsistent: workspace '${record.workspaceId}' has `
                            + `two main worktrees ('${mainHolder}' and '${id}')`);
                    }
                    mainByWorkspace.set(record.workspaceId, id);
                }
                for (const sessionId of record.sessionIds) {
                    const holder = accounted.get(sessionId);
                    if (holder !== undefined) {
                        throw new Error(`worktree domain is inconsistent: session '${sessionId}' is accounted `
                            + `by both worktree '${holder}' and worktree '${id}'`);
                    }
                    accounted.set(sessionId, id);
                }
            }
        }
        rebuildEntities() {
            this.entities.clear();
            for (const id of this.requireState().worktreeIds) {
                const record = this.requireTable().get(id);
                this.entities.set(id, new WorktreeEntity(this.host, id, record));
            }
        }
        async replaceHeaderIndex(headers) {
            this.headers.clear();
            this.sessionPaths.clear();
            this.invalidSessionPaths.clear();
            await this.indexHeaders(headers);
        }
        async indexHeaders(headers) {
            for (const header of headers)
                await this.indexHeader(header);
        }
        async indexHeader(header) {
            this.headers.set(header.id, header);
            this.sessionPaths.delete(header.id);
            if (header.cwd === undefined) {
                this.invalidSessionPaths.set(header.id, 'header has no cwd');
                return;
            }
            try {
                const path = await realpathNormalize(header.cwd);
                if (!(await stat(path)).isDirectory()) {
                    this.invalidSessionPaths.set(header.id, `cwd '${header.cwd}' is not a directory`);
                    return;
                }
                this.sessionPaths.set(header.id, path);
                this.invalidSessionPaths.delete(header.id);
            }
            catch {
                this.invalidSessionPaths.set(header.id, `cwd '${header.cwd}' does not resolve`);
            }
        }
        async indexLiveSessions() {
            const sessions = this.ctx.get('sessions');
            if (sessions === undefined)
                return;
            await this.indexHeaders(sessions.list().map(session => session.header));
        }
        async readSessionHeader(id) {
            const live = this.ctx.get('sessions')?.get(id);
            if (live !== undefined) {
                this.headers.set(id, live.header);
                return live.header;
            }
            const cached = this.headers.get(id);
            if (cached !== undefined)
                return cached;
            const headers = await this.ctx.sessionPersistence.list();
            await this.indexHeaders(headers);
            const header = this.headers.get(id);
            if (header === undefined) {
                throw new Error(`cannot validate session '${id}': session persistence holds no such session`);
            }
            return header;
        }
        requireTable() {
            if (this.table === undefined)
                throw new Error('worktree registry is not started yet');
            return this.table;
        }
        requireState() {
            if (this.state === undefined)
                throw new Error('worktree registry is not started yet');
            return this.state;
        }
        async setState(state) {
            await this.global.set(state);
            this.state = state;
        }
        enqueueOperation(operation) {
            const result = this.operationTail.then(async () => {
                await this.recoverPendingMutation();
                return await operation();
            });
            this.operationTail = result.then(() => { }, () => { });
            return result;
        }
    };
})();
export { WorktreeRegistry };
export default WorktreeRegistry;
