import { useEffect, useState } from 'react'
import type { WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorktreeFooterActionProps } from './contract/slots.ts'
import css from './WorktreeChooserDialog.module.css'

interface DialogProps extends WorktreeFooterActionProps {
  /** Withdraw the dialog. */
  onClose: () => void
}

/**
 * Modal chooser: pick a workspace, then an existing worktree (the main
 * worktree included) or a new branch; starting creates a session in that
 * worktree's directory and opens it.
 */
export function WorktreeChooserDialog({
  useWorkspaces, useWorktrees, listWorktrees, createWorktree, startSessionIn, onClose, t,
}: DialogProps): JSX.Element {
  const workspaces = useWorkspaces(s => s)
  const worktrees = useWorktrees(s => s)
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId | undefined>(undefined)
  const [branch, setBranch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const startIn = async (path: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await startSessionIn(path)
      onClose()
    } catch (reason) {
      setBusy(false)
      setError(String(reason))
    }
  }

  const startNewBranch = async (): Promise<void> => {
    if (workspaceId === undefined || branch.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const created = await createWorktree(workspaceId, branch.trim())
      await startSessionIn(created.path)
      onClose()
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
        <label className={css.field}>
          <span>{t('dialog.workspace')}</span>
          <select
            className={css.select}
            value={workspaceId ?? ''}
            onChange={event => {
              const value = event.target.value
              setWorkspaceId(value === '' ? undefined : value as WorkspaceId)
              setBranch('')
            }}
          >
            <option value="">—</option>
            {workspaces.items.map(workspace => (
              <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.title}</option>
            ))}
          </select>
        </label>
        {workspaceId !== undefined && (
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
                  onClick={() => { void startIn(worktree.path) }}
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
                  if (event.key === 'Enter' && trimmed !== '') void startNewBranch()
                }}
              />
            </label>
            <button
              type="button"
              className={css.primary}
              disabled={busy || trimmed === ''}
              onClick={() => { void startNewBranch() }}
            >
              {t('dialog.start')}
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

/** Sidebar footer action that opens the worktree chooser (always visible). */
export function WorktreeFooterAction(props: WorktreeFooterActionProps): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={css.button}
        onClick={() => { setOpen(true) }}
      >
        {props.t('button.newSession')}
      </button>
      {open && <WorktreeChooserDialog {...props} onClose={() => { setOpen(false) }} />}
    </>
  )
}
