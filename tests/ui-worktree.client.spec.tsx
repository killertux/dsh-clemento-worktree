// @vitest-environment jsdom
// The worktree header badge and the new-session-in-worktree chooser, driven
// props-direct: the badge resolves the current session's worktree, the
// chooser lists a workspace's worktrees and starts sessions in existing or
// freshly created ones.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SessionId, WorkspaceId, WorkspaceListState, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorktreeView } from '@killertux/dsh-clemento-worktree/types'
import type { WorktreeOverlayActionProps } from '../src/client/contract/slots.ts'
import { WorktreeBadge } from '../src/client/WorktreeBadge.tsx'
import { WorktreeComposerButton } from '../src/client/WorktreeChooserDialog.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const SID = 's1' as SessionId
const WID = 'w1' as WorkspaceId

const t: WorktreeOverlayActionProps['t'] =
  (key, params) => (zh[key as keyof typeof zh] ?? key).replace('{{message}}', String(params?.message ?? ''))

/** Wrap a constant snapshot as the selector hook the renderer binds. */
const hook = <T,>(value: T): SnapshotSelectorHook<T> =>
  (() => value) as unknown as SnapshotSelectorHook<T>

/** Live hook stub: reads the holder at call time so listWorktrees results re-render. */
const liveHook = <T,>(get: () => T): SnapshotSelectorHook<T> =>
  ((sel: (s: T) => unknown) => sel(get())) as unknown as SnapshotSelectorHook<T>

/** Session-standard kit stubs the header slots receive from the framework. */
const kit = {
  sessionId: SID,
  useSession: (() => { throw new Error('unused') }) as never,
  useSessions: (() => { throw new Error('unused') }) as never,
  useWorkspaces: (() => { throw new Error('unused') }) as never,
  useProjection: (() => undefined) as never,
  useInput: (() => { throw new Error('unused') }) as never,
  inputActions: { setDraft: () => { throw new Error('unused') }, submit: () => { throw new Error('unused') } } as never,
}

/** Root-scope kit for the shell-overlay trigger: global hooks, no session. */
const footerKit = {
  useSessions: (() => { throw new Error('unused') }) as never,
  useWorkspaces: (() => { throw new Error('unused') }) as never,
}

const workspace = (id: WorkspaceId, title: string): WorkspaceView => ({
  workspaceId: id,
  path: `/tmp/${title}`,
  title,
  sessionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const worktree = (id: string, name: string, path: string, isMain = false): WorktreeView => ({
  worktreeId: id as WorktreeView['worktreeId'],
  workspaceId: WID,
  path,
  name,
  isMain,
  sessionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const workspaceList = (items: WorkspaceView[]): WorkspaceListState => ({
  items,
  archivedSessionIds: [],
  state: 'idle',
  phase: 'ready',
  error: null,
  baselinesReady: true,
  recentWorkspaceId: undefined,
})

describe('WorktreeBadge', () => {
  it('renders the worktree name of the current session', async () => {
    render(
      <WorktreeBadge
        {...kit}
        sessionId={SID}
        t={t}
        worktreeOf={vi.fn(async () => worktree('wt1', 'feature/x', '/tmp/x'))}
      />,
    )
    expect(await screen.findByText('feature/x')).toBeTruthy()
  })

  it('localizes the detached name', async () => {
    render(
      <WorktreeBadge
        {...kit}
        sessionId={SID}
        t={t}
        worktreeOf={vi.fn(async () => worktree('wt2', '(detached)', '/tmp/d'))}
      />,
    )
    expect(await screen.findByText(zh['badge.detached'])).toBeTruthy()
  })

  it('renders nothing for sessions outside every worktree', async () => {
    render(
      <WorktreeBadge
        {...kit}
        sessionId={SID}
        t={t}
        worktreeOf={vi.fn(async () => null)}
      />,
    )
    await waitFor(() => expect(screen.queryByText(/./)).toBeNull())
  })

  it('renders nothing when the lookup fails', async () => {
    render(
      <WorktreeBadge
        {...kit}
        sessionId={SID}
        t={t}
        worktreeOf={vi.fn(async () => { throw new Error('gone') })}
      />,
    )
    await waitFor(() => expect(screen.queryByText(/./)).toBeNull())
  })
})

describe('WorktreeComposerButton chooser', () => {
  it('opens the chooser and starts a session in an existing worktree', async () => {
    const main = worktree('wt-main', 'main', '/tmp/repo', true)
    const linked = worktree('wt-linked', 'feature/foo', '/tmp/repo-feature-foo')
    let current: WorktreeView[] | undefined
    const listWorktrees = vi.fn(async () => {
      current = [main, linked]
      return [main, linked]
    })
    const startSessionIn = vi.fn(async () => {})
    render(
      <WorktreeComposerButton
        {...footerKit}
        t={t}
        useWorkspaces={hook(workspaceList([workspace(WID, 'repo')]))}
        useWorktrees={liveHook(() => current)}
        worktreeOf={vi.fn(async () => null)}
        listWorktrees={listWorktrees}
        createWorktree={vi.fn(async () => { throw new Error('unused') })}
        startSessionIn={startSessionIn}
      />,
    )
    fireEvent.click(screen.getByText(zh['button.newSession']))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: WID } })
    expect(await screen.findByText('feature/foo')).toBeTruthy()
    fireEvent.click(screen.getByText('feature/foo'))
    await waitFor(() => expect(startSessionIn).toHaveBeenCalledWith('/tmp/repo-feature-foo'))
  })

  it('creates a worktree on a new branch and starts a session in it', async () => {
    const created = worktree('wt-new', 'feature/new', '/tmp/repo-feature-new')
    const listWorktrees = vi.fn(async () => [])
    const createWorktree = vi.fn(async () => created)
    const startSessionIn = vi.fn(async () => {})
    render(
      <WorktreeComposerButton
        {...footerKit}
        t={t}
        useWorkspaces={hook(workspaceList([workspace(WID, 'repo')]))}
        useWorktrees={hook([])}
        worktreeOf={vi.fn(async () => null)}
        listWorktrees={listWorktrees}
        createWorktree={createWorktree}
        startSessionIn={startSessionIn}
      />,
    )
    fireEvent.click(screen.getByText(zh['button.newSession']))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: WID } })
    await waitFor(() => expect(listWorktrees).toHaveBeenCalled())
    fireEvent.change(screen.getByPlaceholderText(zh['dialog.newBranch.placeholder']), {
      target: { value: 'feature/new' },
    })
    fireEvent.click(screen.getByText(zh['dialog.start']))
    await waitFor(() => expect(createWorktree).toHaveBeenCalledWith(WID, 'feature/new'))
    await waitFor(() => expect(startSessionIn).toHaveBeenCalledWith('/tmp/repo-feature-new'))
  })

  it('surfaces a create failure instead of closing', async () => {
    const listWorktrees = vi.fn(async () => [])
    const createWorktree = vi.fn(async () => { throw new Error('branch exists') })
    const startSessionIn = vi.fn(async () => {})
    render(
      <WorktreeComposerButton
        {...footerKit}
        t={t}
        useWorkspaces={hook(workspaceList([workspace(WID, 'repo')]))}
        useWorktrees={hook([])}
        worktreeOf={vi.fn(async () => null)}
        listWorktrees={listWorktrees}
        createWorktree={createWorktree}
        startSessionIn={startSessionIn}
      />,
    )
    fireEvent.click(screen.getByText(zh['button.newSession']))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: WID } })
    await waitFor(() => expect(listWorktrees).toHaveBeenCalled())
    fireEvent.change(screen.getByPlaceholderText(zh['dialog.newBranch.placeholder']), {
      target: { value: 'feature/new' },
    })
    fireEvent.click(screen.getByText(zh['dialog.start']))
    expect(await screen.findByText(zh['dialog.error'].replace('{{message}}', 'Error: branch exists'))).toBeTruthy()
    expect(startSessionIn).not.toHaveBeenCalled()
  })
})

// Locale keys must resolve for every key the components call; the en dict is
// the checked-complete twin of zh.
expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
