/**
 * Package-private worktree entity: the single {@link Worktree} implementation.
 * Holds a record snapshot that is swapped in place after each durable
 * mutation; every write funnels through the private `mutate` so `updatedAt`
 * stamping and invalid-account pruning happen exactly once. Not re-exported
 * from the package entrypoint — consumers see only the {@link Worktree}
 * interface.
 * @module @deepseek-ai/dsh-worktree/src/entity
 */
import { stat } from 'node:fs/promises';
import { realpathNormalize } from '@deepseek-ai/dsh-workspace';
/** An insertSessionBefore request named a session or anchor not on the account. */
export class WorktreeMoveInvalidError extends Error {
    /**
     * @param message - Which id was unaccounted and where.
     */
    constructor(message) {
        super(message);
        this.name = 'WorktreeMoveInvalidError';
    }
}
/** Chain-slot abort sentinel thrown by the update fn when the record needs no change. */
const unchangedSentinel = new Error('worktree record unchanged (internal sentinel)');
/** The single {@link Worktree} implementation; constructed only by the registry. */
export class WorktreeEntity {
    host;
    id;
    record;
    /**
     * @param host - Registry-owned table and session-path index.
     * @param id - The record's stable id.
     * @param record - The validated record snapshot loaded or just written.
     */
    constructor(host, id, record) {
        this.host = host;
        this.id = id;
        this.record = record;
    }
    get workspaceId() {
        return this.record.workspaceId;
    }
    get path() {
        return this.record.path;
    }
    get name() {
        return this.record.name;
    }
    get isMain() {
        return this.record.isMain;
    }
    get createdAt() {
        return this.record.createdAt;
    }
    get updatedAt() {
        return this.record.updatedAt;
    }
    get sessionIds() {
        return this.record.sessionIds.filter(id => this.host.sessionPath(id) === this.record.path);
    }
    async setName(name) {
        await this.mutate(record => ({ ...record, name }));
    }
    async attachSession(sessionId) {
        if (!this.record.sessionIds.includes(sessionId)) {
            const header = await this.host.readSessionHeader(sessionId);
            if (header.cwd === undefined) {
                throw new Error(`cannot attach session '${sessionId}' to worktree '${this.record.path}': `
                    + 'its stored header carries no cwd to validate against');
            }
            let cwd;
            try {
                cwd = await realpathNormalize(header.cwd);
            }
            catch (error) {
                throw new Error(`cannot attach session '${sessionId}' to worktree '${this.record.path}': its cwd `
                    + `'${header.cwd}' does not resolve, so it cannot be validated`, { cause: error });
            }
            if (!(await stat(cwd)).isDirectory()) {
                throw new Error(`cannot attach session '${sessionId}' to worktree '${this.record.path}': its cwd `
                    + `'${header.cwd}' is not a directory`);
            }
            if (cwd !== this.record.path) {
                throw new Error(`cannot attach session '${sessionId}' to worktree '${this.record.path}': its cwd resolves to '${cwd}'`);
            }
            this.host.rememberSessionPath(sessionId, cwd);
        }
        await this.mutate(record => record.sessionIds.includes(sessionId)
            ? record
            : { ...record, sessionIds: [sessionId, ...record.sessionIds] });
    }
    async insertSessionBefore(sessionId, beforeSessionId) {
        await this.mutate(record => {
            if (!record.sessionIds.includes(sessionId)) {
                throw new WorktreeMoveInvalidError(`cannot move session '${sessionId}' in worktree '${record.path}': the session is not accounted`);
            }
            if (beforeSessionId !== undefined && !record.sessionIds.includes(beforeSessionId)) {
                throw new WorktreeMoveInvalidError(`cannot move session '${sessionId}' before '${beforeSessionId}' in worktree `
                    + `'${record.path}': the anchor session is not accounted`);
            }
            if (beforeSessionId === sessionId)
                return record;
            const without = record.sessionIds.filter(id => id !== sessionId);
            const at = beforeSessionId === undefined ? without.length : without.indexOf(beforeSessionId);
            const sessionIds = [...without.slice(0, at), sessionId, ...without.slice(at)];
            return sessionIds.every((id, index) => id === record.sessionIds[index])
                ? record
                : { ...record, sessionIds };
        });
    }
    async detachSession(sessionId) {
        await this.mutate(record => record.sessionIds.includes(sessionId)
            ? { ...record, sessionIds: record.sessionIds.filter(id => id !== sessionId) }
            : record);
    }
    async status() {
        try {
            return (await stat(this.record.path)).isDirectory() ? 'ok' : 'missing-dir';
        }
        catch {
            return 'missing-dir';
        }
    }
    /**
     * The single write path: run `fn` on the domain write chain via
     * `table.update`, stamping `updatedAt` and pruning candidates that no
     * longer pass the id-plus-canonical-cwd membership check, then swap the
     * snapshot.
     */
    async mutate(fn) {
        let next;
        try {
            next = await this.host.table().update(this.id, current => {
                const changed = fn(current);
                const sessionIds = changed.sessionIds.filter(id => this.host.sessionPath(id) === changed.path);
                if (changed === current && sessionIds.length === current.sessionIds.length) {
                    throw unchangedSentinel;
                }
                return { ...changed, sessionIds, updatedAt: new Date().toISOString() };
            });
        }
        catch (error) {
            if (error === unchangedSentinel)
                return;
            throw error;
        }
        this.record = next;
    }
}
