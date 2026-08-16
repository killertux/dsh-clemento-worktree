/**
 * Package-private worktree entity: the single {@link Worktree} implementation.
 * Holds a record snapshot that is swapped in place after each durable
 * mutation; every write funnels through the private `mutate` so `updatedAt`
 * stamping and invalid-account pruning happen exactly once. Not re-exported
 * from the package entrypoint — consumers see only the {@link Worktree}
 * interface.
 * @module @deepseek-ai/dsh-worktree/src/entity
 */

import { stat } from 'node:fs/promises'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { realpathNormalize, type WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { WorktreeRecord } from './spec.ts'
import type { Worktree, WorktreeId } from './types.ts'

/** An insertSessionBefore request named a session or anchor not on the account. */
export class WorktreeMoveInvalidError extends Error {
  /**
   * @param message - Which id was unaccounted and where.
   */
  constructor(message: string) {
    super(message)
    this.name = 'WorktreeMoveInvalidError'
  }
}

/** Chain-slot abort sentinel thrown by the update fn when the record needs no change. */
const unchangedSentinel = new Error('worktree record unchanged (internal sentinel)')

/**
 * The registry-owned machinery an entity mutates through. Entities never see
 * the registry itself — only the open table and the canonical session-path
 * index backing the `sessionIds` projection.
 */
export interface WorktreeEntityHost {
  /** Resolve the open `worktrees` table. */
  table(): KvTable<WorktreeId, WorktreeRecord>
  /** Read a session's canonical directory from the registry's header index. */
  sessionPath(id: SessionId): string | undefined
  /** Read one stored session header for attach validation. */
  readSessionHeader(id: SessionId): Promise<SessionHeader>
  /** Publish a successfully validated canonical cwd to the projection index. */
  rememberSessionPath(id: SessionId, path: string): void
}

/** The single {@link Worktree} implementation; constructed only by the registry. */
export class WorktreeEntity implements Worktree {
  private readonly host: WorktreeEntityHost
  readonly id: WorktreeId
  private record: WorktreeRecord

  /**
   * @param host - Registry-owned table and session-path index.
   * @param id - The record's stable id.
   * @param record - The validated record snapshot loaded or just written.
   */
  constructor(host: WorktreeEntityHost, id: WorktreeId, record: WorktreeRecord) {
    this.host = host
    this.id = id
    this.record = record
  }

  get workspaceId(): WorkspaceId {
    return this.record.workspaceId
  }

  get path(): string {
    return this.record.path
  }

  get name(): string {
    return this.record.name
  }

  get isMain(): boolean {
    return this.record.isMain
  }

  get createdAt(): string {
    return this.record.createdAt
  }

  get updatedAt(): string {
    return this.record.updatedAt
  }

  get sessionIds(): readonly SessionId[] {
    return this.record.sessionIds.filter(id => this.host.sessionPath(id) === this.record.path)
  }

  async setName(name: string): Promise<void> {
    await this.mutate(record => ({ ...record, name }))
  }

  async attachSession(sessionId: SessionId): Promise<void> {
    if (!this.record.sessionIds.includes(sessionId)) {
      const header = await this.host.readSessionHeader(sessionId)
      if (header.cwd === undefined) {
        throw new Error(
          `cannot attach session '${sessionId}' to worktree '${this.record.path}': `
          + 'its stored header carries no cwd to validate against',
        )
      }
      let cwd: string
      try {
        cwd = await realpathNormalize(header.cwd)
      } catch (error) {
        throw new Error(
          `cannot attach session '${sessionId}' to worktree '${this.record.path}': its cwd `
          + `'${header.cwd}' does not resolve, so it cannot be validated`,
          { cause: error },
        )
      }
      if (!(await stat(cwd)).isDirectory()) {
        throw new Error(
          `cannot attach session '${sessionId}' to worktree '${this.record.path}': its cwd `
          + `'${header.cwd}' is not a directory`,
        )
      }
      if (cwd !== this.record.path) {
        throw new Error(
          `cannot attach session '${sessionId}' to worktree '${this.record.path}': its cwd resolves to '${cwd}'`,
        )
      }
      this.host.rememberSessionPath(sessionId, cwd)
    }
    await this.mutate(record =>
      record.sessionIds.includes(sessionId)
        ? record
        : { ...record, sessionIds: [sessionId, ...record.sessionIds] })
  }

  async insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void> {
    await this.mutate(record => {
      if (!record.sessionIds.includes(sessionId)) {
        throw new WorktreeMoveInvalidError(
          `cannot move session '${sessionId}' in worktree '${record.path}': the session is not accounted`,
        )
      }
      if (beforeSessionId !== undefined && !record.sessionIds.includes(beforeSessionId)) {
        throw new WorktreeMoveInvalidError(
          `cannot move session '${sessionId}' before '${beforeSessionId}' in worktree `
          + `'${record.path}': the anchor session is not accounted`,
        )
      }
      if (beforeSessionId === sessionId) return record
      const without = record.sessionIds.filter(id => id !== sessionId)
      const at = beforeSessionId === undefined ? without.length : without.indexOf(beforeSessionId)
      const sessionIds = [...without.slice(0, at), sessionId, ...without.slice(at)]
      return sessionIds.every((id, index) => id === record.sessionIds[index])
        ? record
        : { ...record, sessionIds }
    })
  }

  async detachSession(sessionId: SessionId): Promise<void> {
    await this.mutate(record =>
      record.sessionIds.includes(sessionId)
        ? { ...record, sessionIds: record.sessionIds.filter(id => id !== sessionId) }
        : record)
  }

  async status(): Promise<'ok' | 'missing-dir'> {
    try {
      return (await stat(this.record.path)).isDirectory() ? 'ok' : 'missing-dir'
    } catch {
      return 'missing-dir'
    }
  }

  /**
   * The single write path: run `fn` on the domain write chain via
   * `table.update`, stamping `updatedAt` and pruning candidates that no
   * longer pass the id-plus-canonical-cwd membership check, then swap the
   * snapshot.
   */
  private async mutate(fn: (current: WorktreeRecord) => WorktreeRecord): Promise<void> {
    let next: WorktreeRecord
    try {
      next = await this.host.table().update(this.id, current => {
        const changed = fn(current)
        const sessionIds = changed.sessionIds.filter(id => this.host.sessionPath(id) === changed.path)
        if (changed === current && sessionIds.length === current.sessionIds.length) {
          throw unchangedSentinel
        }
        return { ...changed, sessionIds, updatedAt: new Date().toISOString() }
      })
    } catch (error) {
      if (error === unchangedSentinel) return
      throw error
    }
    this.record = next
  }
}
