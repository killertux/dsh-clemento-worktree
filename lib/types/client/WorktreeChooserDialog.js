import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import css from './WorktreeChooserDialog.module.css';
/**
 * Modal chooser: pick a workspace, then an existing worktree (the main
 * worktree included) or a new branch; starting creates a session in that
 * worktree's directory and opens it.
 */
export function WorktreeChooserDialog({ useWorkspaces, useWorktrees, listWorktrees, createWorktree, startSessionIn, onClose, t, }) {
    const workspaces = useWorkspaces(s => s);
    const worktrees = useWorktrees(s => s);
    const [workspaceId, setWorkspaceId] = useState(undefined);
    const [branch, setBranch] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
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
    const startIn = async (path) => {
        setBusy(true);
        setError(null);
        try {
            await startSessionIn(path);
            onClose();
        }
        catch (reason) {
            setBusy(false);
            setError(String(reason));
        }
    };
    const startNewBranch = async () => {
        if (workspaceId === undefined || branch.trim() === '')
            return;
        setBusy(true);
        setError(null);
        try {
            const created = await createWorktree(workspaceId, branch.trim());
            await startSessionIn(created.path);
            onClose();
        }
        catch (reason) {
            setBusy(false);
            setError(String(reason));
        }
    };
    const trimmed = branch.trim();
    return (_jsx("div", { className: css.overlay, role: "dialog", "aria-modal": "true", "aria-label": t('dialog.title'), children: _jsxs("div", { className: css.dialog, children: [_jsx("h2", { className: css.title, children: t('dialog.title') }), error !== null && _jsx("p", { className: css.error, children: t('dialog.error', { message: error }) }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('dialog.workspace') }), _jsxs("select", { className: css.select, value: workspaceId ?? '', onChange: event => {
                                const value = event.target.value;
                                setWorkspaceId(value === '' ? undefined : value);
                                setBranch('');
                            }, children: [_jsx("option", { value: "", children: "\u2014" }), workspaces.items.map(workspace => (_jsx("option", { value: workspace.workspaceId, children: workspace.title }, workspace.workspaceId)))] })] }), workspaceId !== undefined && (_jsxs(_Fragment, { children: [_jsx("p", { className: css.sectionLabel, children: t('dialog.worktree.existing') }), worktrees !== undefined && worktrees.length === 0 && (_jsx("p", { className: css.muted, children: t('dialog.worktree.none') })), _jsx("div", { className: css.worktreeList, children: (worktrees ?? []).map(worktree => (_jsxs("button", { type: "button", className: css.worktree, disabled: busy, onClick: () => { void startIn(worktree.path); }, children: [_jsx("span", { className: css.worktreeName, children: worktree.name }), _jsx("span", { className: css.worktreePath, title: worktree.path, children: worktree.path })] }, worktree.worktreeId))) }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('dialog.newBranch') }), _jsx("input", { className: css.input, value: branch, disabled: busy, placeholder: t('dialog.newBranch.placeholder'), onChange: event => { setBranch(event.target.value); }, onKeyDown: event => {
                                        if (event.key === 'Enter' && trimmed !== '')
                                            void startNewBranch();
                                    } })] }), _jsx("button", { type: "button", className: css.primary, disabled: busy || trimmed === '', onClick: () => { void startNewBranch(); }, children: t('dialog.start') })] })), _jsx("button", { type: "button", className: css.secondary, disabled: busy, onClick: onClose, children: t('dialog.cancel') })] }) }));
}
/** Floating worktree-setup trigger (shell overlay layer, root scope). */
export function WorktreeComposerButton(props) {
    const [open, setOpen] = useState(false);
    return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: css.floating, onClick: () => { setOpen(true); }, children: props.t('button.newSession') }), open && _jsx(WorktreeChooserDialog, { ...props, onClose: () => { setOpen(false); } })] }));
}
