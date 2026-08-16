/** `worktree` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'badge.detached': '游离分支',
  'button.newSession': '新会话到工作树',
  'dialog.title': '在 git 工作树中开始会话',
  'dialog.workspace': '工作区',
  'dialog.workspace.empty': '没有可用的工作区。',
  'dialog.worktree.existing': '已有工作树',
  'dialog.worktree.none': '这个工作区还没有可用的工作树。',
  'dialog.newBranch': '新建分支',
  'dialog.newBranch.placeholder': '分支名，例如 feature/foo',
  'dialog.start': '开始会话',
  'dialog.cancel': '取消',
  'dialog.error': '创建失败：{{message}}',
  'dialog.loading': '正在查询…',
} satisfies Record<string, string>

/** The worktree namespace key union. */
export type WorktreeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'badge.detached': 'detached',
  'button.newSession': 'New session in worktree',
  'dialog.title': 'Start a session in a git worktree',
  'dialog.workspace': 'Workspace',
  'dialog.workspace.empty': 'No workspaces available.',
  'dialog.worktree.existing': 'Existing worktrees',
  'dialog.worktree.none': 'This workspace has no worktrees yet.',
  'dialog.newBranch': 'New branch',
  'dialog.newBranch.placeholder': 'Branch name, e.g. feature/foo',
  'dialog.start': 'Start session',
  'dialog.cancel': 'Cancel',
  'dialog.error': 'Failed: {{message}}',
  'dialog.loading': 'Loading…',
} satisfies Record<WorktreeKey, string>
