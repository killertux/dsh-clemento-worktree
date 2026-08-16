import { useEffect, useState } from 'react'
import type { WorktreeView } from '@killertux/dsk-clemento-worktree/types'
import type { WorktreeBadgeProps } from './contract/slots.ts'
import css from './WorktreeBadge.module.css'

const DETACHED_NAME = '(detached)'

/**
 * Static session context: the name of the git worktree the current session
 * runs in, or nothing for sessions outside every worktree. Negative order
 * puts it in the header's leading context band.
 */
export function WorktreeBadge({ sessionId, worktreeOf, t }: WorktreeBadgeProps): JSX.Element | null {
  const [worktree, setWorktree] = useState<WorktreeView | null>(null)
  useEffect(() => {
    let alive = true
    worktreeOf(sessionId).then(
      view => { if (alive) setWorktree(view) },
      () => { if (alive) setWorktree(null) },
    )
    return () => { alive = false }
  }, [sessionId, worktreeOf])
  if (worktree === null) return null
  return (
    <span className={css.badge} title={worktree.path}>
      {worktree.name === DETACHED_NAME ? t('badge.detached') : worktree.name}
    </span>
  )
}
