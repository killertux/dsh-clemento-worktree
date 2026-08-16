import { useEffect, useState } from 'react'
import type { WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorktreeHeroActionProps } from './contract/slots.ts'
import css from './WorktreeDropdown.module.css'

/**
 * Start-page worktree dropdown, rendered right of the workspace selector by
 * the ui-conversation seam (`conversation.hero.actions`). The workspace is
 * the one already chosen by the workspace selector (derived from the current
 * blank session's cwd); the menu lists that workspace's worktrees — the main
 * worktree included — or offers a new branch. Choosing one applies it:
 * the blank session whose cwd is the worktree path is opened (created if
 * missing), so the first message starts the session in that worktree.
 */
export function WorktreeDropdown(props: WorktreeHeroActionProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sessions = props.useSessions(s => s)
  const workspaces = props.useWorkspaces(s => s.items)
  const worktrees = props.useWorktrees(s => s)

  const current = sessions.current === undefined ? undefined : sessions.byId[sessions.current]
  const workspace = current === undefined
    ? undefined
    : workspaces.find(candidate => candidate.path === current.cwd)
  const workspaceId = workspace?.workspaceId
  // The selected worktree: the current blank session's cwd matches one.
  const selected = (worktrees ?? []).find(worktree => worktree.path === current?.cwd)

  useEffect(() => {
    if (!open || workspaceId === undefined) return
    let alive = true
    setBusy(true)
    setError(null)
    props.listWorktrees(workspaceId).then(
      () => { if (alive) setBusy(false) },
      (reason: unknown) => { if (alive) { setBusy(false); setError(String(reason)) } },
    )
    return () => { alive = false }
  }, [open, workspaceId, props.listWorktrees])

  const apply = async (path: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await props.selectWorktree(path)
      setOpen(false)
    } catch (reason) {
      setBusy(false)
      setError(String(reason))
    }
  }

  const applyNewBranch = async (): Promise<void> => {
    if (workspaceId === undefined || branch.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const created = await props.createWorktree(workspaceId, branch.trim())
      await apply(created.path)
    } catch (reason) {
      setBusy(false)
      setError(String(reason))
    }
  }

  const trimmed = branch.trim()
  return (
    <div className={css.wrap}>
      <button
        type="button"
        className={css.chip}
        aria-expanded={open}
        onClick={() => { setOpen(open => !open) }}
      >
        {selected?.name ?? props.t('button.selectWorktree')}
      </button>
      {open && (
        <div className={css.menu} role="menu" aria-label={props.t('dialog.title')}>
          {error !== null && <p className={css.error}>{props.t('dialog.error', { message: error })}</p>}
          {workspaceId === undefined ? (
            <p className={css.muted}>{props.t('dialog.workspaceFirst')}</p>
          ) : (
            <>
              {(worktrees ?? []).map(worktree => (
                <button
                  key={worktree.worktreeId}
                  type="button"
                  role="menuitem"
                  className={css.item}
                  disabled={busy}
                  onClick={() => { void apply(worktree.path) }}
                >
                  <span className={css.itemName}>{worktree.name}</span>
                  <span className={css.itemPath} title={worktree.path}>{worktree.path}</span>
                </button>
              ))}
              {(worktrees === undefined || worktrees.length === 0) && (
                <p className={css.muted}>{props.t('dialog.worktree.none')}</p>
              )}
              <div className={css.newBranch}>
                <input
                  className={css.input}
                  value={branch}
                  disabled={busy}
                  placeholder={props.t('dialog.newBranch.placeholder')}
                  onChange={event => { setBranch(event.target.value) }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && trimmed !== '') void applyNewBranch()
                  }}
                />
                <button
                  type="button"
                  className={css.apply}
                  disabled={busy || trimmed === ''}
                  onClick={() => { void applyNewBranch() }}
                >
                  {props.t('dialog.apply')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
