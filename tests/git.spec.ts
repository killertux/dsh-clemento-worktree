import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import WorktreeGit, { GitCommandError, siblingPath } from '../src/git/index.ts'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Boot the real local-subprocess provider plus the git seam under test. */
async function harness(): Promise<WorktreeGit> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(WorktreeGit)
  return ctx.worktreeGit
}

/** Create a temp git repository with one commit on branch `main`. */
function initRepo(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `dsh-worktree-git-${name}-`))
  roots.push(root)
  git(root, ['init', '-b', 'main'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  writeFileSync(join(root, 'file.txt'), 'one\n')
  git(root, ['add', 'file.txt'])
  git(root, ['commit', '-m', 'initial'])
  return root
}

/** Run git synchronously inside `cwd` for test scaffolding. */
function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

describe('worktree-git seam', () => {
  it('detects git repositories and plain directories', async () => {
    const seam = await harness()
    const repo = initRepo('detect')
    expect(await seam.isGitRepo(repo)).toBe(true)
    const plain = mkdtempSync(join(tmpdir(), 'dsh-worktree-git-plain-'))
    roots.push(plain)
    expect(await seam.isGitRepo(plain)).toBe(false)
    expect(await seam.isGitRepo(join(plain, 'missing'))).toBe(false)
  })

  it('reports the worktree root and current branch of a checkout', async () => {
    const seam = await harness()
    const repo = initRepo('root')
    expect(await seam.worktreeRoot(repo)).toBe(repo)
    expect(await seam.currentBranch(repo)).toBe('main')
  })

  it('returns undefined branch facts for a non-repository directory', async () => {
    const seam = await harness()
    const plain = mkdtempSync(join(tmpdir(), 'dsh-worktree-git-notrepo-'))
    roots.push(plain)
    expect(await seam.worktreeRoot(plain)).toBeUndefined()
    expect(await seam.currentBranch(plain)).toBeUndefined()
  })

  it('lists the main worktree of a fresh repository', async () => {
    const seam = await harness()
    const repo = initRepo('list-main')
    const entries = await seam.listWorktrees(repo)
    expect(entries).toEqual([{ path: repo, branch: 'main', detached: false }])
  })

  it('creates a linked worktree on a new branch at the default sibling path', async () => {
    const seam = await harness()
    const repo = initRepo('add')
    const entry = await seam.addWorktree(repo, 'feature/alpha')
    expect(entry.branch).toBe('feature/alpha')
    expect(entry.path).toBe(siblingPath(repo, 'feature/alpha'))
    const entries = await seam.listWorktrees(repo)
    expect(entries).toContainEqual(entry)
    expect(await seam.currentBranch(entry.path)).toBe('feature/alpha')
  })

  it('suffixes the sibling path when the default target already exists', async () => {
    const seam = await harness()
    const repo = initRepo('suffix')
    // 'feature/beta' and 'feature-beta' sanitize to the same path segment, so
    // the second creation must suffix its sibling path (branches differ, so
    // git accepts both).
    const first = await seam.addWorktree(repo, 'feature/beta')
    const second = await seam.addWorktree(repo, 'feature-beta')
    expect(first.path).toBe(siblingPath(repo, 'feature/beta'))
    expect(second.path).toBe(`${siblingPath(repo, 'feature/beta')}-2`)
    expect(second.path).not.toBe(first.path)
  })

  it('rejects creating a worktree on an existing branch', async () => {
    const seam = await harness()
    const repo = initRepo('existing-branch')
    await expect(seam.addWorktree(repo, 'main')).rejects.toMatchObject({
      name: 'GitCommandError',
    } as Partial<GitCommandError>)
  })

  it('parses a detached linked worktree', async () => {
    const seam = await harness()
    const repo = initRepo('detached')
    const target = join(repo, '-detached')
    git(repo, ['worktree', 'add', '--detach', target])
    roots.push(target)
    const entries = await seam.listWorktrees(repo)
    expect(entries.find(entry => entry.path === target)).toMatchObject({ branch: null, detached: true })
  })

  it('removes a linked worktree and its directory', async () => {
    const seam = await harness()
    const repo = initRepo('remove')
    const entry = await seam.addWorktree(repo, 'feature/gamma')
    await seam.removeWorktree(repo, entry.path)
    const entries = await seam.listWorktrees(repo)
    expect(entries.find(candidate => candidate.path === entry.path)).toBeUndefined()
  })

  it('refuses to remove the main worktree', async () => {
    const seam = await harness()
    const repo = initRepo('remove-main')
    await expect(seam.removeWorktree(repo, repo)).rejects.toMatchObject({
      name: 'GitCommandError',
    } as Partial<GitCommandError>)
  })

  it('rejects worktree listing outside a repository', async () => {
    const seam = await harness()
    const plain = mkdtempSync(join(tmpdir(), 'dsh-worktree-git-nolist-'))
    roots.push(plain)
    await expect(seam.listWorktrees(plain)).rejects.toMatchObject({
      name: 'GitCommandError',
    } as Partial<GitCommandError>)
  })

  it('sanitizes branch names for sibling directory segments', () => {
    expect(siblingPath('/home/user/repo', 'feat/x y')).toBe('/home/user/repo-feat-x-y')
    expect(siblingPath('/home/user/repo', '..')).toBe('/home/user/repo-worktree')
    expect(siblingPath('/tmp/a', 'branch-with.dot_underscore-1')).toBe('/tmp/a-branch-with.dot_underscore-1')
  })
})
