import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import css from './WorktreeBadge.module.css';
const DETACHED_NAME = '(detached)';
/**
 * Static session context: the name of the git worktree the current session
 * runs in, or nothing for sessions outside every worktree. Negative order
 * puts it in the header's leading context band.
 */
export function WorktreeBadge({ sessionId, worktreeOf, t }) {
    const [worktree, setWorktree] = useState(null);
    useEffect(() => {
        let alive = true;
        worktreeOf(sessionId).then(view => { if (alive)
            setWorktree(view); }, () => { if (alive)
            setWorktree(null); });
        return () => { alive = false; };
    }, [sessionId, worktreeOf]);
    if (worktree === null)
        return null;
    return (_jsx("span", { className: css.badge, title: worktree.path, children: worktree.name === DETACHED_NAME ? t('badge.detached') : worktree.name }));
}
