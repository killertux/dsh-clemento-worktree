import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import css from './WorktreeChooserDialog.module.css';
/**
 * Worktree selector for the next session: the workspace is the one already
 * chosen by the start-page workspace selector (derived from the current blank
 * session's cwd), so the dialog only lists that workspace's worktrees — the
 * main worktree included — or offers a new branch. Choosing one applies it:
 * the blank session whose cwd is the worktree path is opened (created if
 * missing), so the first message starts the session in that worktree.
 */
export function WorktreeChooserDialog({ useSessions, useWorkspaces, useWorktrees, listWorktrees, createWorktree, selectWorktree, onClose, t, }) {
    const sessions = useSessions(s => s);
    const workspaces = useWorkspaces(s => s.items);
    const worktrees = useWorktrees(s => s);
    const [branch, setBranch] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // The workspace already selected in the start page: the current (blank)
    // session's cwd resolves to a workspace path.
    const current = sessions.current === undefined ? undefined : sessions.byId[sessions.current];
    const workspace = current === undefined
        ? undefined
        : workspaces.find(candidate => candidate.path === current.cwd);
    const workspaceId = workspace?.workspaceId;
    useEffect(() => {
        if (workspaceId === undefined)
            return;
        let alive = true;
        setBusy(true);
        setError(null);
        listWorktrees(workspaceId).then(() => { if (alive)
            setBusy(false); }, (reason) => { if (alive) {
            setBusy(false);
            setError(String(reason));
        } });
        return () => { alive = false; };
    }, [workspaceId, listWorktrees]);
    const apply = async (path) => {
        setBusy(true);
        setError(null);
        try {
            await selectWorktree(path);
            onClose();
        }
        catch (reason) {
            setBusy(false);
            setError(String(reason));
        }
    };
    const applyNewBranch = async () => {
        if (workspaceId === undefined || branch.trim() === '')
            return;
        setBusy(true);
        setError(null);
        try {
            const created = await createWorktree(workspaceId, branch.trim());
            await apply(created.path);
        }
        catch (reason) {
            setBusy(false);
            setError(String(reason));
        }
    };
    const trimmed = branch.trim();
    return (_jsx("div", { className: css.overlay, role: "dialog", "aria-modal": "true", "aria-label": t('dialog.title'), children: _jsxs("div", { className: css.dialog, children: [_jsx("h2", { className: css.title, children: t('dialog.title') }), error !== null && _jsx("p", { className: css.error, children: t('dialog.error', { message: error }) }), workspaceId === undefined ? (_jsx("p", { className: css.muted, children: t('dialog.workspaceFirst') })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: css.sectionLabel, children: t('dialog.worktree.existing') }), worktrees !== undefined && worktrees.length === 0 && (_jsx("p", { className: css.muted, children: t('dialog.worktree.none') })), _jsx("div", { className: css.worktreeList, children: (worktrees ?? []).map(worktree => (_jsxs("button", { type: "button", className: css.worktree, disabled: busy, onClick: () => { void apply(worktree.path); }, children: [_jsx("span", { className: css.worktreeName, children: worktree.name }), _jsx("span", { className: css.worktreePath, title: worktree.path, children: worktree.path })] }, worktree.worktreeId))) }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('dialog.newBranch') }), _jsx("input", { className: css.input, value: branch, disabled: busy, placeholder: t('dialog.newBranch.placeholder'), onChange: event => { setBranch(event.target.value); }, onKeyDown: event => {
                                        if (event.key === 'Enter' && trimmed !== '')
                                            void applyNewBranch();
                                    } })] }), _jsx("button", { type: "button", className: css.primary, disabled: busy || trimmed === '', onClick: () => { void applyNewBranch(); }, children: t('dialog.apply') })] })), _jsx("button", { type: "button", className: css.secondary, disabled: busy, onClick: onClose, children: t('dialog.cancel') })] }) }));
}
/**
 * Floating worktree selector trigger (shell overlay layer, root scope).
 * Hidden once the current session has started (a non-blank session): it is
 * meant for the start page — before or right after choosing a workspace,
 * while the session is still blank.
 */
export function WorktreeComposerButton(props) {
    const [open, setOpen] = useState(false);
    const sessions = props.useSessions(s => s);
    const current = sessions.current === undefined ? undefined : sessions.byId[sessions.current];
    const started = current !== undefined && !current.blank;
    if (started && !open)
        return null;
    return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: css.floating, onClick: () => { setOpen(true); }, children: props.t('button.selectWorktree') }), open && _jsx(WorktreeChooserDialog, { ...props, onClose: () => { setOpen(false); } })] }));
}
