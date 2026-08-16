import { useEffect, useState } from 'react'
import type { WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorktreeOverlayActionProps } from './contract/slots.ts'
import css from './WorktreeChooserDialog.module.css'

interface DialogProps extends WorktreeOverlayActionProps {
  /** Withdraw the dialog. */
  onClose: () => void
}

/**
 * Worktree selector for the next session: the workspace is the one already
 * chosen by the start-page workspace selector (derived from the current blank
 * session's cwd), so the dialog only lists that workspace's worktrees — the
 * main worktree included — or offers a new branch. Choosing one applies it:
 * the blank session whose cwd is the worktree path is opened (created if
 * missing), so the first message starts the session in that worktree.
 */
export function WorktreeChooserDialog({
  useSessions, useWorkspaces, useWorktrees, listWorktrees, createWorktree, selectWorktree, onClose, t,
}: DialogProps): JSX.Element {
  const sessions = useSessions(s => s)
  const workspaces = useWorkspaces(s => s.items)
  const worktrees = useWorktrees(s => s)
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The workspace already selected in the start page: the current (blank)
  // session's cwd resolves to a workspace path.
  const current = sessions.current === undefined ? undefined : sessions.byId[sessions.current]
  const workspace = current === undefined
    ? undefined
    : workspaces.find(candidate => candidate.path === current.cwd)
  const workspaceId = workspace?.workspaceId

  useEffect(() => {
    if (workspaceId === undefined) return
    let alive = true
    setBusy(true)
    setError(null)
    listWorktrees(workspaceId).then(
      () => { if (alive) setBusy(false) },
      (reason: unknown) => { if (alive) { setBusy(false); setError(String(reason)) } },
    )
    return () => { alive = false }
  }, [workspaceId, listWorktrees])

  const apply = async (path: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await selectWorktree(path)
      onClose()
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
      const created = await createWorktree(workspaceId, branch.trim())
      await apply(created.path)
    } catch (reason) {
      setBusy(false)
      setError(String(reason))
    }
  }

  const trimmed = branch.trim()
  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label={t('dialog.title')}>
      <div className={css.dialog}>
        <h2 className={css.title}>{t('dialog.title')}</h2>
        {error !== null && <p className={css.error}>{t('dialog.error', { message: error })}</p>}
        {workspaceId === undefined ? (
          <p className={css.muted}>{t('dialog.workspaceFirst')}</p>
        ) : (
          <>
            <p className={css.sectionLabel}>{t('dialog.worktree.existing')}</p>
            {worktrees !== undefined && worktrees.length === 0 && (
              <p className={css.muted}>{t('dialog.worktree.none')}</p>
            )}
            <div className={css.worktreeList}>
              {(worktrees ?? []).map(worktree => (
                <button
                  key={worktree.worktreeId}
                  type="button"
                  className={css.worktree}
                  disabled={busy}
                  onClick={() => { void apply(worktree.path) }}
                >
                  <span className={css.worktreeName}>{worktree.name}</span>
                  <span className={css.worktreePath} title={worktree.path}>{worktree.path}</span>
                </button>
              ))}
            </div>
            <label className={css.field}>
              <span>{t('dialog.newBranch')}</span>
              <input
                className={css.input}
                value={branch}
                disabled={busy}
                placeholder={t('dialog.newBranch.placeholder')}
                onChange={event => { setBranch(event.target.value) }}
                onKeyDown={event => {
                  if (event.key === 'Enter' && trimmed !== '') void applyNewBranch()
                }}
              />
            </label>
            <button
              type="button"
              className={css.primary}
              disabled={busy || trimmed === ''}
              onClick={() => { void applyNewBranch() }}
            >
              {t('dialog.apply')}
            </button>
          </>
        )}
        <button type="button" className={css.secondary} disabled={busy} onClick={onClose}>
          {t('dialog.cancel')}
        </button>
      </div>
    </div>
  )
}

/**
 * Floating worktree selector trigger (shell overlay layer, root scope).
 * Hidden once the current session has started (a non-blank session): it is
 * meant for the start page — before or right after choosing a workspace,
 * while the session is still blank.
 */
export function WorktreeComposerButton(props: WorktreeOverlayActionProps): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const sessions = props.useSessions(s => s)
  const current = sessions.current === undefined ? undefined : sessions.byId[sessions.current]
  const started = current !== undefined && !current.blank
  if (started && !open) return null
  return (
    <>
      <button
        type="button"
        className={css.floating}
        onClick={() => { setOpen(true) }}
      >
        {props.t('button.selectWorktree')}
      </button>
      {open && <WorktreeChooserDialog {...props} onClose={() => { setOpen(false) }} />}
    </>
  )
}
