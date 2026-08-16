/**
 * Worktree registry (`ctx.worktreeRegistry`): durable git-worktree records per
 * workspace, session accounting by canonical cwd, and the typert remote face
 * the browser consumes. The main worktree is the workspace's own directory;
 * linked worktrees are discovered from `git worktree list` or created through
 * this registry. Mounts beside the workspace registry in its own domain.
 * @module @deepseek-ai/dsh-worktree
 */

import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { Context, Service } from '@deepseek-ai/cordis'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { DomainGlobal, KvTable } from '@deepseek-ai/dsh-storage-domain'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { WorkspaceId, type Workspace } from '@deepseek-ai/dsh-workspace'
import { realpathNormalize } from '@deepseek-ai/dsh-workspace'
import type {} from '../git/index.ts'
import { WorktreeEntity } from './entity.ts'
import type { WorktreeEntityHost } from './entity.ts'
import { worktreeDomainSpec } from './spec.ts'
import type { WorktreeDomainState, WorktreeRecord } from './spec.ts'
import type {
  Worktree,
  WorktreeBySessionRequest,
  WorktreeCreateRequest,
  WorktreeCreateResult,
  WorktreeDeleteRequest,
  WorktreeDeleteResult,
  WorktreeId as WorktreeIdBrand,
  WorktreeListRequest,
  WorktreeListResult,
  WorktreeResolveRequest,
  WorktreeResolveResult,
  WorktreeView,
} from './types.ts'

export type {
  Worktree,
  WorktreeView,
  WorktreeBySessionRequest,
  WorktreeCreateRequest,
  WorktreeCreateResult,
  WorktreeDeleteRequest,
  WorktreeDeleteResult,
  WorktreeListRequest,
  WorktreeListResult,
  WorktreeResolveRequest,
  WorktreeResolveResult,
} from './types.ts'
export { worktreeDomainState, worktreeRecord, worktreeDomainSpec } from './spec.ts'
export type { WorktreeDomainState, WorktreeRecord } from './spec.ts'
export { WorktreeMoveInvalidError } from './entity.ts'

/** Identifies one worktree record (see `src/types.ts` for the brand rationale). */
export type WorktreeId = WorktreeIdBrand

/**
 * Brand a string as a {@link WorktreeId}.
 * @param id - Raw worktree id string.
 * @returns the same string, branded at compile time.
 */
export function WorktreeId(id: string): WorktreeId {
  return id as WorktreeId
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    worktreeRegistry: WorktreeRegistry
  }
}

const DETACHED_NAME = '(detached)'

/**
 * Durable worktree registry. Startup waits for session persistence and the
 * workspace registry, indexes session headers by canonical cwd, and mints
 * main-worktree records for git workspaces before the service becomes
 * active. Live session creation is adopted through `session/created`.
 */
export class WorktreeRegistry extends TypertRemoteService {
  static inject = ['storageDomain', 'sessionPersistence', 'worktreeGit', 'workspaceRegistry']

  private table?: KvTable<WorktreeId, WorktreeRecord>
  private global?: DomainGlobal<WorktreeDomainState>
  private state?: WorktreeDomainState
  private readonly entities = new Map<WorktreeId, WorktreeEntity>()
  private readonly headers = new Map<SessionId, SessionHeader>()
  private readonly sessionPaths = new Map<SessionId, string>()
  private readonly invalidSessionPaths = new Map<SessionId, string>()
  private operationTail: Promise<void> = Promise.resolve()

  private readonly host: WorktreeEntityHost = {
    table: () => this.requireTable(),
    sessionPath: id => this.sessionPaths.get(id),
    readSessionHeader: id => this.readSessionHeader(id),
    rememberSessionPath: (id, path) => {
      this.sessionPaths.set(id, path)
      this.invalidSessionPaths.delete(id)
    },
  }

  constructor(ctx: Context) {
    super(ctx, 'worktreeRegistry')
    // Adopt every newly created session whose cwd matches a registered
    // worktree. The registry stays authoritative for worktree membership
    // without touching the workspace/session creation path.
    ctx.on('session/created', session => {
      void this.adoptSession(session.id, session.header.cwd)
    })
    // Ensure worktrees for workspaces registered after this registry booted:
    // a new workspace record landing in the workspace domain triggers the
    // same main-worktree mint + git discovery as startup bootstrap.
    ctx.on('domain/changed', change => {
      if (change.domain !== 'workspace' || change.table !== 'workspaces' || change.operation !== 'put') return
      if (this.state === undefined) return // this registry not started yet
      const workspace = ctx.workspaceRegistry.get(WorkspaceId(change.key))
      if (workspace !== undefined) void this.ensureForWorkspace(workspace)
    })
  }

  /** Open the domain, finish bootstrap when required, and rebuild the cache. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(worktreeDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'worktree.domainClose')
    this.table = domain.table('worktrees')
    this.global = domain.global
    this.state = domain.global.get()

    await this.recoverPendingMutation()
    this.validateStoredState(this.state)
    await this.replaceHeaderIndex(await this.ctx.sessionPersistence.list())
    if (!this.state.initialized) {
      await this.bootstrap()
    }
    await this.indexLiveSessions()
    this.validateStoredState(this.requireState())
    this.rebuildEntities()
    await this.adoptIndexedSessions()
  }

  /**
   * The wire read face: durable worktree records of one workspace, main
   * worktree first, in registry order.
   * @param request - the owning workspace.
   * @returns the workspace's worktree views.
   */
  @Remote('list')
  async list(request: WorktreeListRequest): Promise<WorktreeListResult> {
    const workspaceId = request.workspaceId
    this.requireWorkspace(workspaceId)
    return { items: this.listViews(workspaceId) }
  }

  /**
   * Create a linked worktree on a NEW branch: runs `git worktree add` at the
   * default sibling path, then records the resulting directory durably.
   * @param request - the owning workspace (must be a git worktree) and the new branch name.
   * @returns the created worktree view.
   * @throws when the workspace is not a git worktree or git rejects the branch.
   */
  @Remote('create')
  async create(request: WorktreeCreateRequest): Promise<WorktreeCreateResult> {
    const { workspaceId, branch } = request
    const workspace = this.requireWorkspace(workspaceId)
    if (!await this.ctx.worktreeGit.isGitRepo(workspace.path)) {
      throw new Error(`cannot create a worktree: '${workspace.path}' is not a git worktree`)
    }
    const entry = await this.ctx.worktreeGit.addWorktree(workspace.path, branch)
    const canonical = await realpathNormalize(entry.path)
    const entity = await this.enqueueOperation(() =>
      this.createRecord(workspaceId, canonical, branch, false))
    return { worktree: this.view(entity) }
  }

  /**
   * Remove a linked worktree: runs `git worktree remove --force`, then deletes
   * the durable record. The main worktree can never be removed.
   * @param request - the owning workspace and the linked worktree to remove.
   * @returns `deleted: true` when a record was deleted, `false` when it was unknown.
   */
  @Remote('delete')
  async delete(request: WorktreeDeleteRequest): Promise<WorktreeDeleteResult> {
    const { workspaceId, worktreeId } = request
    const entity = this.entities.get(worktreeId)
    if (entity === undefined) return { deleted: false }
    if (entity.workspaceId !== workspaceId) {
      throw new Error(`worktree '${worktreeId}' does not belong to workspace '${workspaceId}'`)
    }
    if (entity.isMain) throw new Error('the main worktree cannot be removed')
    const workspace = this.requireWorkspace(workspaceId)
    await this.ctx.worktreeGit.removeWorktree(workspace.path, entity.path)
    await this.enqueueOperation(() => this.deleteRecord(worktreeId))
    return { deleted: true }
  }

  /**
   * Re-sync durable records with `git worktree list`: adopt newly discovered
   * linked worktrees and prune records whose directory git no longer lists.
   * @param request - the owning workspace.
   * @returns the refreshed worktree views.
   */
  @Remote('discover')
  async discover(request: WorktreeListRequest): Promise<WorktreeListResult> {
    const workspaceId = request.workspaceId
    const workspace = this.requireWorkspace(workspaceId)
    const entries = await this.ctx.worktreeGit.listWorktrees(workspace.path)
    const seen = new Set<string>()
    for (const entry of entries) {
      const canonical = await realpathNormalize(entry.path)
      if (canonical === workspace.path) continue // the main worktree is ensured separately
      seen.add(canonical)
      if (this.byPath(canonical) !== undefined) continue
      const name = entry.branch ?? DETACHED_NAME
      await this.enqueueOperation(() => this.createRecord(workspaceId, canonical, name, false))
    }
    for (const entity of [...this.entities.values()]) {
      if (entity.workspaceId !== workspaceId || entity.isMain) continue
      if (!seen.has(entity.path)) {
        await this.enqueueOperation(() => this.deleteRecord(entity.id))
      }
    }
    return { items: this.listViews(workspaceId) }
  }

  /**
   * The worktree containing a directory, for the session badge: any cwd maps
   * to at most one registered worktree path.
   * @param request - a directory path in any spelling.
   * @returns the matching worktree view, or null when none matches.
   */
  @Remote('resolve')
  async resolve(request: WorktreeResolveRequest): Promise<WorktreeResolveResult> {
    let canonical: string
    try {
      canonical = await realpathNormalize(request.cwd)
    } catch {
      return { worktree: null }
    }
    const entity = this.byPath(canonical)
    return { worktree: entity === undefined ? null : this.view(entity) }
  }

  /**
   * The worktree accounting a session, resolving the session's header cwd
   * on demand when the index has not seen it yet.
   * @param request - the session to locate.
   * @returns the worktree view, or null when the session is in no worktree.
   */
  @Remote('bySession')
  async bySession(request: WorktreeBySessionRequest): Promise<WorktreeResolveResult> {
    const sessionId = request.sessionId
    if (this.sessionPaths.has(sessionId) === false) {
      try {
        const header = await this.readSessionHeader(sessionId)
        if (header.cwd !== undefined) await this.adoptSession(sessionId, header.cwd)
      } catch {
        return { worktree: null }
      }
    }
    const path = this.sessionPaths.get(sessionId)
    if (path === undefined) return { worktree: null }
    const entity = this.byPath(path)
    return { worktree: entity === undefined ? null : this.view(entity) }
  }

  /**
   * Look up a worktree by id.
   * @param id - Worktree id.
   * @returns the worktree, or `undefined` when unknown.
   */
  get(id: WorktreeId): Worktree | undefined {
    return this.entities.get(id)
  }

  private async bootstrap(): Promise<void> {
    for (const workspace of this.ctx.workspaceRegistry.list()) {
      await this.ensureForWorkspace(workspace)
    }
    await this.setState({ ...this.requireState(), initialized: true })
  }

  /**
   * Mint the main worktree of a git workspace (when absent) and re-sync
   * linked worktrees from `git worktree list`. Non-git workspaces are
   * untouched. Runs on startup bootstrap and when a workspace is registered
   * while this registry is live.
   */
  private async ensureForWorkspace(workspace: Workspace): Promise<void> {
    if (!await this.ctx.worktreeGit.isGitRepo(workspace.path)) return
    if (this.byPath(workspace.path) === undefined) {
      const branch = await this.ctx.worktreeGit.currentBranch(workspace.path)
      await this.enqueueOperation(() =>
        this.createRecord(workspace.id, workspace.path, branch ?? DETACHED_NAME, true))
    }
    await this.discover({ workspaceId: workspace.id })
  }

  /** Adopt every indexed session whose cwd matches a registered worktree (idempotent). */
  private async adoptIndexedSessions(): Promise<void> {
    for (const [sessionId, path] of [...this.sessionPaths]) {
      const entity = this.byPath(path)
      if (entity !== undefined) await entity.attachSession(sessionId)
    }
  }

  /**
   * Adopt one session into the worktree matching its cwd, if any. Failures
   * are silent: an unresolvable or mismatched cwd simply means no worktree
   * accounts this session.
   */
  private async adoptSession(sessionId: SessionId, cwd: string | undefined): Promise<void> {
    if (cwd === undefined) return
    let canonical: string
    try {
      canonical = await realpathNormalize(cwd)
      if (!(await stat(canonical)).isDirectory()) return
    } catch {
      return
    }
    this.sessionPaths.set(sessionId, canonical)
    this.invalidSessionPaths.delete(sessionId)
    const entity = this.byPath(canonical)
    if (entity !== undefined) await entity.attachSession(sessionId)
  }

  private byPath(path: string): WorktreeEntity | undefined {
    for (const entity of this.entities.values()) {
      if (entity.path === path) return entity
    }
    return undefined
  }

  private listViews(workspaceId: WorkspaceId): WorktreeView[] {
    const main = [...this.entities.values()]
      .filter(entity => entity.workspaceId === workspaceId && entity.isMain)
      .map(entity => this.view(entity))
    const linked = this.requireState().worktreeIds
      .map(id => this.entities.get(id))
      .filter((entity): entity is WorktreeEntity =>
        entity !== undefined && entity.workspaceId === workspaceId && !entity.isMain)
      .map(entity => this.view(entity))
    return [...main, ...linked]
  }

  private view(entity: WorktreeEntity): WorktreeView {
    return {
      worktreeId: entity.id,
      workspaceId: entity.workspaceId,
      path: entity.path,
      name: entity.name,
      isMain: entity.isMain,
      sessionIds: [...entity.sessionIds],
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    }
  }

  private requireWorkspace(workspaceId: WorkspaceId): Workspace {
    const workspace = this.ctx.workspaceRegistry.get(workspaceId)
    if (workspace === undefined) {
      throw new Error(`cannot resolve workspace '${workspaceId}'`)
    }
    return workspace
  }

  private async createRecord(
    workspaceId: WorkspaceId,
    path: string,
    name: string,
    isMain: boolean,
  ): Promise<WorktreeEntity> {
    const table = this.requireTable()
    const state = this.requireState()
    const id = WorktreeId(randomUUID())
    const now = new Date().toISOString()
    const record: WorktreeRecord = {
      workspaceId,
      path,
      name,
      isMain,
      sessionIds: [],
      createdAt: now,
      updatedAt: now,
    }
    const entity = new WorktreeEntity(this.host, id, record)
    this.entities.set(id, entity)
    try {
      await this.setState({ ...state, pendingMutation: { operation: 'create', worktreeId: id } })
    } catch (error) {
      this.entities.delete(id)
      throw error
    }
    try {
      await table.put(id, record)
    } catch (error) {
      this.entities.delete(id)
      try {
        await this.setState(state)
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `worktree '${id}' record write and pending-marker rollback both failed`,
        )
      }
      throw error
    }
    try {
      await this.setState({
        initialized: true,
        worktreeIds: [id, ...state.worktreeIds],
      })
    } catch (error) {
      this.entities.delete(id)
      try {
        await table.delete(id)
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `worktree '${id}' order write and record rollback both failed; the pending marker remains recoverable`,
        )
      }
      try {
        await this.setState(state)
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `worktree '${id}' order write and pending-marker rollback both failed`,
        )
      }
      throw error
    }
    return entity
  }

  private async deleteRecord(id: WorktreeId): Promise<boolean> {
    const entity = this.entities.get(id)
    if (entity === undefined) return false
    const state = this.requireState()
    const nextState = {
      initialized: true,
      worktreeIds: state.worktreeIds.filter(worktreeId => worktreeId !== id),
    }
    await this.setState({ ...nextState, pendingMutation: { operation: 'delete', worktreeId: id } })
    this.entities.delete(id)
    try {
      await this.requireTable().delete(id)
    } catch (error) {
      this.entities.set(id, entity)
      try {
        await this.setState(state)
      } catch (rollbackError) {
        this.entities.delete(id)
        throw new AggregateError(
          [error, rollbackError],
          `worktree '${id}' record deletion and registry-order rollback both failed`,
        )
      }
      throw error
    }
    try {
      await this.setState(nextState)
    } catch (error) {
      this.ctx.logger.warn(
        `worktree '${id}' was deleted but its pending marker could not be cleared: ${String(error)}`,
      )
    }
    return true
  }

  /**
   * Complete the one mutation explicitly named by durable state. Unexplained
   * order/table divergence still reaches {@link validateStoredState} and
   * fails loud.
   */
  private async recoverPendingMutation(): Promise<void> {
    const state = this.requireState()
    const pending = state.pendingMutation
    if (pending === undefined) return
    if (state.worktreeIds.includes(pending.worktreeId)) {
      throw new Error(
        `worktree domain is inconsistent: pending ${pending.operation} worktree `
        + `'${pending.worktreeId}' is still present in registry order`,
      )
    }
    await this.requireTable().delete(pending.worktreeId)
    await this.setState({ initialized: state.initialized, worktreeIds: state.worktreeIds })
  }

  private validateStoredState(state: WorktreeDomainState): void {
    const table = this.requireTable()
    const order = new Set<WorktreeId>()
    for (const id of state.worktreeIds) {
      if (order.has(id)) {
        throw new Error(`worktree domain is inconsistent: registry order repeats worktree '${id}'`)
      }
      if (table.get(id) === undefined) {
        throw new Error(`worktree domain is inconsistent: registry order references missing worktree '${id}'`)
      }
      order.add(id)
    }
    if (state.initialized && order.size !== table.size) {
      const orphan = [...table.keys()].find(id => !order.has(id))
      throw new Error(
        `worktree domain is inconsistent: worktree '${orphan as WorktreeId}' is absent from registry order`,
      )
    }

    const paths = new Map<string, WorktreeId>()
    const accounted = new Map<SessionId, WorktreeId>()
    const mainByWorkspace = new Map<WorkspaceId, WorktreeId>()
    for (const [id, record] of table.entries()) {
      const pathHolder = paths.get(record.path)
      if (pathHolder !== undefined) {
        throw new Error(
          `worktree domain is inconsistent: path '${record.path}' is claimed `
          + `by both worktree '${pathHolder}' and worktree '${id}'`,
        )
      }
      paths.set(record.path, id)
      if (record.isMain) {
        const mainHolder = mainByWorkspace.get(record.workspaceId)
        if (mainHolder !== undefined) {
          throw new Error(
            `worktree domain is inconsistent: workspace '${record.workspaceId}' has `
            + `two main worktrees ('${mainHolder}' and '${id}')`,
          )
        }
        mainByWorkspace.set(record.workspaceId, id)
      }
      for (const sessionId of record.sessionIds) {
        const holder = accounted.get(sessionId)
        if (holder !== undefined) {
          throw new Error(
            `worktree domain is inconsistent: session '${sessionId}' is accounted `
            + `by both worktree '${holder}' and worktree '${id}'`,
          )
        }
        accounted.set(sessionId, id)
      }
    }
  }

  private rebuildEntities(): void {
    this.entities.clear()
    for (const id of this.requireState().worktreeIds) {
      const record = this.requireTable().get(id) as WorktreeRecord
      this.entities.set(id, new WorktreeEntity(this.host, id, record))
    }
  }

  private async replaceHeaderIndex(headers: readonly SessionHeader[]): Promise<void> {
    this.headers.clear()
    this.sessionPaths.clear()
    this.invalidSessionPaths.clear()
    await this.indexHeaders(headers)
  }

  private async indexHeaders(headers: readonly SessionHeader[]): Promise<void> {
    for (const header of headers) await this.indexHeader(header)
  }

  private async indexHeader(header: SessionHeader): Promise<void> {
    this.headers.set(header.id, header)
    this.sessionPaths.delete(header.id)
    if (header.cwd === undefined) {
      this.invalidSessionPaths.set(header.id, 'header has no cwd')
      return
    }
    try {
      const path = await realpathNormalize(header.cwd)
      if (!(await stat(path)).isDirectory()) {
        this.invalidSessionPaths.set(header.id, `cwd '${header.cwd}' is not a directory`)
        return
      }
      this.sessionPaths.set(header.id, path)
      this.invalidSessionPaths.delete(header.id)
    } catch {
      this.invalidSessionPaths.set(header.id, `cwd '${header.cwd}' does not resolve`)
    }
  }

  private async indexLiveSessions(): Promise<void> {
    const sessions = this.ctx.get('sessions')
    if (sessions === undefined) return
    await this.indexHeaders(sessions.list().map(session => session.header))
  }

  private async readSessionHeader(id: SessionId): Promise<SessionHeader> {
    const live = this.ctx.get('sessions')?.get(id)
    if (live !== undefined) {
      this.headers.set(id, live.header)
      return live.header
    }
    const cached = this.headers.get(id)
    if (cached !== undefined) return cached

    const headers = await this.ctx.sessionPersistence.list()
    await this.indexHeaders(headers)
    const header = this.headers.get(id)
    if (header === undefined) {
      throw new Error(`cannot validate session '${id}': session persistence holds no such session`)
    }
    return header
  }

  private requireTable(): KvTable<WorktreeId, WorktreeRecord> {
    if (this.table === undefined) throw new Error('worktree registry is not started yet')
    return this.table
  }

  private requireState(): WorktreeDomainState {
    if (this.state === undefined) throw new Error('worktree registry is not started yet')
    return this.state
  }

  private async setState(state: WorktreeDomainState): Promise<void> {
    await (this.global as DomainGlobal<WorktreeDomainState>).set(state)
    this.state = state
  }

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(async () => {
      await this.recoverPendingMutation()
      return await operation()
    })
    this.operationTail = result.then(() => {}, () => {})
    return result
  }
}

export default WorktreeRegistry
