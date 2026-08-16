import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import css from './WorktreeDropdown.module.css';
/**
 * Start-page worktree dropdown, rendered right of the workspace selector by
 * the ui-conversation seam (`conversation.hero.actions`). The workspace is
 * the one already chosen by the workspace selector (derived from the current
 * blank session's cwd); the menu lists that workspace's worktrees — the main
 * worktree included — or offers a new branch. Choosing one applies it:
 * the blank session whose cwd is the worktree path is opened (created if
 * missing), so the first message starts the session in that worktree.
 */
export function WorktreeDropdown(props) {
    const [open, setOpen] = useState(false);
    const [branch, setBranch] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const sessions = props.useSessions(s => s);
    const workspaces = props.useWorkspaces(s => s.items);
    const worktrees = props.useWorktrees(s => s);
    const current = sessions.current === undefined ? undefined : sessions.byId[sessions.current];
    const workspace = current === undefined
        ? undefined
        : workspaces.find(candidate => candidate.path === current.cwd);
    const workspaceId = workspace?.workspaceId;
    // The selected worktree: the current blank session's cwd matches one.
    const selected = (worktrees ?? []).find(worktree => worktree.path === current?.cwd);
    useEffect(() => {
        if (!open || workspaceId === undefined)
            return;
        let alive = true;
        setBusy(true);
        setError(null);
        props.listWorktrees(workspaceId).then(() => { if (alive)
            setBusy(false); }, (reason) => { if (alive) {
            setBusy(false);
            setError(String(reason));
        } });
        return () => { alive = false; };
    }, [open, workspaceId, props.listWorktrees]);
    const apply = async (path) => {
        setBusy(true);
        setError(null);
        try {
            await props.selectWorktree(path);
            setOpen(false);
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
            const created = await props.createWorktree(workspaceId, branch.trim());
            await apply(created.path);
        }
        catch (reason) {
            setBusy(false);
            setError(String(reason));
        }
    };
    const trimmed = branch.trim();
    return (_jsxs("div", { className: css.wrap, children: [_jsx("button", { type: "button", className: css.chip, "aria-expanded": open, onClick: () => { setOpen(open => !open); }, children: selected?.name ?? props.t('button.selectWorktree') }), open && (_jsxs("div", { className: css.menu, role: "menu", "aria-label": props.t('dialog.title'), children: [error !== null && _jsx("p", { className: css.error, children: props.t('dialog.error', { message: error }) }), workspaceId === undefined ? (_jsx("p", { className: css.muted, children: props.t('dialog.workspaceFirst') })) : (_jsxs(_Fragment, { children: [(worktrees ?? []).map(worktree => (_jsxs("button", { type: "button", role: "menuitem", className: css.item, disabled: busy, onClick: () => { void apply(worktree.path); }, children: [_jsx("span", { className: css.itemName, children: worktree.name }), _jsx("span", { className: css.itemPath, title: worktree.path, children: worktree.path })] }, worktree.worktreeId))), (worktrees === undefined || worktrees.length === 0) && (_jsx("p", { className: css.muted, children: props.t('dialog.worktree.none') })), _jsxs("div", { className: css.newBranch, children: [_jsx("input", { className: css.input, value: branch, disabled: busy, placeholder: props.t('dialog.newBranch.placeholder'), onChange: event => { setBranch(event.target.value); }, onKeyDown: event => {
                                            if (event.key === 'Enter' && trimmed !== '')
                                                void applyNewBranch();
                                        } }), _jsx("button", { type: "button", className: css.apply, disabled: busy || trimmed === '', onClick: () => { void applyNewBranch(); }, children: props.t('dialog.apply') })] })] }))] }))] }));
}
