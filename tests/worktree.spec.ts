import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { GitWorktreeEntry } from '../src/git/types.ts'
import WorktreeRegistry, { WorktreeId } from '../src/worktree/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from './helpers/memory-backend.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Existing temp directory used as a workspace or worktree path. */
function makeDir(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `dsh-worktree-${name}-`))
  roots.push(root)
  return root
}

const header = (id: string, cwd?: string, createdAt = 0): SessionHeader => ({
  version: 0,
  id: SessionId(id),
  createdAt,
  ...(cwd === undefined ? {} : { cwd }),
})

/** Mutable git state the fake seam answers from; tests drive it directly. */
interface GitState {
  isRepo: boolean
  branch: string | undefined
  worktrees: GitWorktreeEntry[]
  added: { branch: string; path: string }[]
  removed: string[]
}

function fakeGit(state: GitState) {
  return {
    isGitRepo: vi.fn(async () => state.isRepo),
    currentBranch: vi.fn(async () => state.branch),
    listWorktrees: vi.fn(async () => [...state.worktrees]),
    addWorktree: vi.fn(async (workspacePath: string, branch: string) => {
      const segment = branch.replace(/[^0-9A-Za-z._-]+/g, '-') || 'worktree'
      const path = join(dirname(workspacePath), `${basename(workspacePath)}-${segment}`)
      mkdirSync(path, { recursive: true })
      state.worktrees.push({ path, branch, detached: false })
      state.added.push({ branch, path })
      return { path, branch, detached: false }
    }),
    removeWorktree: vi.fn(async (_workspacePath: string, path: string) => {
      state.worktrees = state.worktrees.filter(entry => entry.path !== path)
      state.removed.push(path)
    }),
  }
}

interface HarnessOptions {
  git?: Partial<GitState>
  sessions?: SessionHeader[]
  liveSessions?: SessionHeader[]
  workspaces?: Workspace[]
}

async function harness(options: HarnessOptions = {}) {
  const pool = new MemoryMediaPool()
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)

  let listed = options.sessions ?? []
  const list = vi.fn(async () => listed)
  const load = vi.fn(() => { throw new Error('event bodies must not be loaded') })
  const inspect = vi.fn(() => { throw new Error('event bodies must not be inspected') })
  ctx.provide('sessionPersistence', { list, load, inspect } as never)

  if (options.liveSessions !== undefined) {
    const live = new Map(options.liveSessions.map(meta => [meta.id, { header: meta }]))
    ctx.provide('sessions', {
      get: (id: SessionId) => live.get(id),
      list: () => [...live.values()],
    } as never)
  }

  const workspaces = options.workspaces ?? []
  ctx.provide('workspaceRegistry', {
    list: () => workspaces,
    get: (id: WorkspaceId) => workspaces.find(workspace => workspace.id === id),
  } as never)

  const state: GitState = {
    isRepo: options.git?.isRepo ?? false,
    branch: options.git?.branch,
    worktrees: options.git?.worktrees ?? [],
    added: [],
    removed: [],
  }
  ctx.provide('worktreeGit', fakeGit(state) as never)

  const changes: DomainChanged[] = []
  ctx.on('domain/changed', change => { changes.push(change) })
  const fiber = await ctx.plugin(WorktreeRegistry)
  const initChanges = [...changes]
  changes.length = 0
  return {
    ctx,
    fiber,
    pool,
    registry: ctx.worktreeRegistry,
    state,
    changes,
    initChanges,
    setSessions: (headers: SessionHeader[]) => { listed = headers },
  }
}

function workspace(id: string, path: string): Workspace {
  const now = new Date().toISOString()
  return {
    id: WorkspaceId(id),
    path,
    title: basename(path),
    createdAt: now,
    updatedAt: now,
    sessionIds: [],
    setTitle: async () => {},
    attachSession: async () => {},
    insertSessionBefore: async () => {},
    detachSession: async () => {},
    status: async () => 'ok',
  } as Workspace
}

describe('worktree registry', () => {
  it('mints no worktrees for non-git workspaces', async () => {
    const root = makeDir('plain')
    const h = await harness({ workspaces: [workspace('w1', root)] })
    expect((await h.registry.list({ workspaceId: WorkspaceId('w1') })).items).toEqual([])
  })

  it('mints a main worktree for a git workspace at bootstrap', async () => {
    const root = makeDir('gitmain')
    const h = await harness({
      git: { isRepo: true, branch: 'main' },
      workspaces: [workspace('w1', root)],
    })
    const views = await h.registry.list({ workspaceId: WorkspaceId('w1') })
    expect(views.items).toHaveLength(1)
    expect(views.items[0]).toMatchObject({ isMain: true, name: 'main', path: root })
  })

  it('adopts historical sessions whose cwd matches the main worktree', async () => {
    const root = makeDir('adopt')
    const h = await harness({
      git: { isRepo: true, branch: 'main' },
      workspaces: [workspace('w1', root)],
      sessions: [header('s1', root)],
    })
    const views = await h.registry.list({ workspaceId: WorkspaceId('w1') })
    expect(views.items[0]?.sessionIds).toEqual([SessionId('s1')])
  })

  it('creates a linked worktree on a new branch', async () => {
    const root = makeDir('create')
    const h = await harness({
      git: { isRepo: true, branch: 'main', worktrees: [{ path: root, branch: 'main', detached: false }] },
      workspaces: [workspace('w1', root)],
    })
    const created = (await h.registry.create({ workspaceId: WorkspaceId('w1'), branch: 'feature/x' })).worktree
    expect(created).toMatchObject({ name: 'feature/x', isMain: false })
    expect(h.state.added).toHaveLength(1)
    const views = await h.registry.list({ workspaceId: WorkspaceId('w1') })
    expect(views.items).toHaveLength(2)
    expect(views.items.find(view => !view.isMain)?.path).toBe(created.path)
  })

  it('rejects creating a worktree for a non-git workspace', async () => {
    const root = makeDir('notgit')
    const h = await harness({ workspaces: [workspace('w1', root)] })
    await expect(h.registry.create({ workspaceId: WorkspaceId('w1'), branch: 'feature/x' })).rejects.toThrow(/not a git worktree/)
  })

  it('deletes a linked worktree and removes it from git', async () => {
    const root = makeDir('delete')
    const h = await harness({
      git: { isRepo: true, branch: 'main', worktrees: [{ path: root, branch: 'main', detached: false }] },
      workspaces: [workspace('w1', root)],
    })
    const created = (await h.registry.create({ workspaceId: WorkspaceId('w1'), branch: 'feature/y' })).worktree
    const result = await h.registry.delete({ workspaceId: WorkspaceId('w1'), worktreeId: created.worktreeId })
    expect(result).toEqual({ deleted: true })
    expect(h.state.removed).toEqual([created.path])
    expect((await h.registry.list({ workspaceId: WorkspaceId('w1') })).items).toHaveLength(1)
  })

  it('refuses to delete the main worktree', async () => {
    const root = makeDir('delmain')
    const h = await harness({
      git: { isRepo: true, branch: 'main' },
      workspaces: [workspace('w1', root)],
    })
    const main = (await h.registry.list({ workspaceId: WorkspaceId('w1') })).items[0] as NonNullable<Awaited<ReturnType<WorktreeRegistry['list']>>['items'][number]>
    await expect(h.registry.delete({ workspaceId: WorkspaceId('w1'), worktreeId: main.worktreeId })).rejects.toThrow(/main worktree/)
  })

  it('reports false for deleting an unknown worktree', async () => {
    const root = makeDir('unknown')
    const h = await harness({ workspaces: [workspace('w1', root)] })
    expect(await h.registry.delete({ workspaceId: WorkspaceId('w1'), worktreeId: WorktreeId('missing') })).toEqual({ deleted: false })
  })

  it('resolves a cwd to its worktree', async () => {
    const root = makeDir('resolve')
    const linked = makeDir('resolve-linked')
    const h = await harness({
      git: { isRepo: true, branch: 'main', worktrees: [{ path: linked, branch: 'feature/z', detached: false }] },
      workspaces: [workspace('w1', root)],
    })
    await h.registry.discover({ workspaceId: WorkspaceId('w1') })
    expect((await h.registry.resolve({ cwd: linked })).worktree?.name).toBe('feature/z')
    expect((await h.registry.resolve({ cwd: makeDir('elsewhere') })).worktree).toBeNull()
  })

  it('resolves the worktree accounting a session', async () => {
    const root = makeDir('bysession')
    const linked = makeDir('bysession-linked')
    const h = await harness({
      git: { isRepo: true, branch: 'main', worktrees: [{ path: linked, branch: 'feature/a', detached: false }] },
      workspaces: [workspace('w1', root)],
      sessions: [header('s1', linked)],
    })
    await h.registry.discover({ workspaceId: WorkspaceId('w1') })
    const view = await h.registry.bySession({ sessionId: SessionId('s1') })
    expect(view.worktree?.name).toBe('feature/a')
    expect((await h.registry.bySession({ sessionId: SessionId('unknown') })).worktree).toBeNull()
  })

  it('adopts a live session created in a worktree', async () => {
    const root = makeDir('live')
    const linked = makeDir('live-linked')
    const h = await harness({
      git: { isRepo: true, branch: 'main', worktrees: [{ path: linked, branch: 'feature/b', detached: false }] },
      workspaces: [workspace('w1', root)],
      liveSessions: [header('live1', linked)],
    })
    await h.registry.discover({ workspaceId: WorkspaceId('w1') })
    h.ctx.emit('session/created', { id: SessionId('live1'), header: { cwd: linked } } as never)
    await vi.waitFor(async () => {
      expect((await h.registry.bySession({ sessionId: SessionId('live1') })).worktree).not.toBeNull()
    })
    const view = await h.registry.bySession({ sessionId: SessionId('live1') })
    expect(view.worktree?.name).toBe('feature/b')
  })

  it('discovers new linked worktrees and prunes removed ones', async () => {
    const root = makeDir('discover')
    const linked = makeDir('discover-linked')
    const h = await harness({
      git: { isRepo: true, branch: 'main', worktrees: [{ path: linked, branch: 'feature/c', detached: false }] },
      workspaces: [workspace('w1', root)],
    })
    await h.registry.discover({ workspaceId: WorkspaceId('w1') })
    expect((await h.registry.list({ workspaceId: WorkspaceId('w1') })).items).toHaveLength(2)
    h.state.worktrees = [{ path: root, branch: 'main', detached: false }]
    await h.registry.discover({ workspaceId: WorkspaceId('w1') })
    expect((await h.registry.list({ workspaceId: WorkspaceId('w1') })).items).toHaveLength(1)
  })

  it('rejects attaching a session whose cwd differs from the worktree path', async () => {
    const root = makeDir('mismatch')
    const elsewhere = makeDir('mismatch-else')
    const h = await harness({
      git: { isRepo: true, branch: 'main' },
      workspaces: [workspace('w1', root)],
      sessions: [header('s1', elsewhere)],
    })
    const views = await h.registry.list({ workspaceId: WorkspaceId('w1') })
    const entity = h.registry.get(views.items[0]?.worktreeId ?? WorktreeId('missing'))
    await expect(entity?.attachSession(SessionId('s1'))).rejects.toThrow(/resolves to/)
  })

  it('requires a live workspace for remote operations', async () => {
    const h = await harness()
    await expect(h.registry.list({ workspaceId: WorkspaceId('missing') })).rejects.toThrow(/cannot resolve workspace/)
  })
})
