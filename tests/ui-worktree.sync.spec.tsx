// @vitest-environment jsdom
// The client apply() wiring: the session→workspace mapping must be fetched
// ONCE per session-id set, not once per session-list snapshot mutation.
// Regression: a snapshot-store change fired on every title/running/message
// update, and every change re-queried ALL non-worktree sessions (they were
// never cached), flooding /api/worktreeRegistry/mapBySessions.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

const hoisted = vi.hoisted(() => {
  /** Minimal writable snapshot store matching the runtime contract. */
  const createSnapshotStore = <T,>(init: T) => {
    let state = init
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => state,
      set: (next: T) => { state = next; for (const fn of listeners) fn() },
      subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    }
  }
  return { createSnapshotStore }
})

vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({ createSnapshotStore: hoisted.createSnapshotStore }))
vi.mock('@killertux/dsh-clemento-worktree/remote', () => ({ default: {} }))

import { apply } from '../src/client/index.ts'

/** Sessions face the plugin reads through ctx.get('sessions'): a live id list. */
function sessionsFace(ids: () => string[]) {
  const listeners = new Set<() => void>()
  return {
    list: {
      getSnapshot: () => ({
        ids: ids(),
        byId: Object.fromEntries(ids().map(id => [id, { id }])),
        current: undefined,
      }),
      subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    },
    // selectWorktree reuses blank sessions and opens; not exercised here.
    open: () => {},
    _listeners: listeners,
  }
}

function makeCtx() {
  let ids: string[] = ['s1', 's2']
  const registry = {
    mapBySessions: vi.fn(async ({ sessionIds }: { sessionIds: string[] }) => {
      const mappings: Record<string, string> = {}
      for (const id of sessionIds) if (id.startsWith('wt-')) mappings[id] = `ws-${id.slice(3)}`
      return { ok: true, value: { mappings } }
    }),
    bySession: vi.fn(async () => ({ ok: true, value: { worktree: null } })),
    list: vi.fn(async () => ({ ok: true, value: { items: [] } })),
    create: vi.fn(async () => ({ ok: true, value: { worktree: {} } })),
  }
  const sessions = sessionsFace(() => ids)
  const provided: Record<string, unknown> = {}
  const slotsInjected: string[] = []
  const ctx = {
    remote: { $mount: vi.fn(async () => () => {}), worktreeRegistry: registry },
    get: (key: string) => {
      if (key === 'sessions') return sessions
      if (key === 'remote.worktreeRegistry') return registry
      return undefined
    },
    effect: (fn: () => void) => { fn() },
    provide: (name: string, value: unknown) => { provided[name] = value },
    locale: { register: () => {} },
    slots: { inject: (name: string) => { slotsInjected.push(name) } },
  }
  const notify = () => { for (const fn of (sessions as unknown as { _listeners: Set<() => void> })._listeners) fn() }
  return { ctx: ctx as unknown as ClientContext, registry, provided, slotsInjected, setIds: (next: string[]) => { ids = next }, notify }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => { vi.restoreAllMocks() })

describe('client apply mapping sync', () => {
  it('queries mapBySessions once per id-set, not per snapshot mutation', async () => {
    const { ctx, registry, provided, setIds, notify } = makeCtx()
    await apply(ctx)
    await flush()

    expect(registry.mapBySessions).toHaveBeenCalledTimes(1)

    // Snapshot mutations (same ids — e.g. title/running/message updates) fire
    // the subscription but must NOT re-query: the id set is unchanged.
    notify()
    notify()
    await flush()
    expect(registry.mapBySessions).toHaveBeenCalledTimes(1)

    // A new session id appears → exactly one call, only with the NEW id
    // (negatives from the earlier set are cached, so s1/s2 are not re-sent).
    setIds(['s1', 's2', 'wt-3'])
    notify()
    await flush()
    expect(registry.mapBySessions).toHaveBeenCalledTimes(2)
    expect(registry.mapBySessions.mock.calls[1][0].sessionIds).toEqual(['wt-3'])

    // The worktree session lands in the exposed mapping service; plain
    // sessions stay unmapped (negative cache did not invent entries).
    const workspace = provided.worktreeWorkspace as { workspaceOf: (id: string) => string | undefined }
    expect(workspace.workspaceOf('wt-3')).toBe('ws-3')
    expect(workspace.workspaceOf('s1')).toBeUndefined()

    // A subsequent id-set change with only known ids triggers nothing.
    setIds(['s1', 's2', 'wt-3'])
    notify()
    await flush()
    expect(registry.mapBySessions).toHaveBeenCalledTimes(2)
  })

  it('registers the badge and dropdown slots without extra remote traffic', async () => {
    const { ctx, registry, slotsInjected } = makeCtx()
    await apply(ctx)
    await flush()
    expect(slotsInjected).toContain('conversation.session.header.actions')
    expect(slotsInjected).toContain('conversation.hero.actions')
    expect(registry.mapBySessions).toHaveBeenCalledTimes(1)
    expect(registry.bySession).not.toHaveBeenCalled()
  })
})
