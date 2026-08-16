import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionPersistenceJsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { SessionId } from '@deepseek-ai/dsh-session'
import WorktreeRegistry from '../src/worktree/index.ts'
import * as WorktreePlugin from '../src/index.ts'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

const suite = process.platform === 'linux' || process.platform === 'darwin' ? describe : describe.skip

/** Real Loader composition: storage, sessions, workspaces, and the worktree registry over real git. */
suite('worktree real Loader composition through cordis.yml', () => {
  it('mints the main worktree, discovers linked worktrees, and creates/removes sessions in them', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-worktree-loader-'))
    const repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, ['init', '-b', 'main'])
    git(repo, ['config', 'user.email', 'test@example.com'])
    git(repo, ['config', 'user.name', 'Test'])
    writeFileSync(join(repo, 'file.txt'), 'one\n')
    git(repo, ['add', 'file.txt'])
    git(repo, ['commit', '-m', 'initial'])
    const linked = join(root, 'repo-feature-existing')
    git(repo, ['worktree', 'add', linked, '-b', 'feature/existing'])

    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-storage'",
      "- name: '@deepseek-ai/dsh-storage-json'",
      '  config:',
      `    root: ${JSON.stringify(join(root, 'storages'))}`,
      "- name: '@deepseek-ai/dsh-storage-domain'",
      '  config:',
      '    backend: json',
      "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-session-persistence-jsonl'",
      '  config:',
      `    root: ${JSON.stringify(join(root, 'sessions'))}`,
      "- name: '@deepseek-ai/dsh-workspace'",
      "- name: '@deepseek-ai/dsh-subprocess-local'",
      "- name: '@killertux/dsh-clemento-worktree'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-storage', Storage],
      ['@deepseek-ai/dsh-storage-json', StorageJson],
      ['@deepseek-ai/dsh-storage-domain', StorageDomain],
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@deepseek-ai/dsh-session-persistence-jsonl', SessionPersistenceJsonl],
      ['@deepseek-ai/dsh-workspace', WorkspaceRegistry],
      ['@deepseek-ai/dsh-subprocess-local', LocalSubprocessRuntime],
      ['@killertux/dsh-clemento-worktree', WorktreePlugin],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    const workspace = await context.workspaceRegistry.create(repo)
    const workspaceId = workspace.id

    // Creating the workspace triggered ensureForWorkspace: the main worktree
    // is minted and linked worktrees discovered (async, so poll).
    let discovered = await context.worktreeRegistry.list({ workspaceId })
    for (let attempt = 0; attempt < 40 && discovered.items.length !== 2; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 25))
      discovered = await context.worktreeRegistry.list({ workspaceId })
    }
    expect(discovered.items).toHaveLength(2)
    const main = discovered.items.find(entry => entry.isMain)
    const existing = discovered.items.find(entry => !entry.isMain)
    expect(main).toMatchObject({ name: 'main', path: repo })
    expect(existing).toMatchObject({ name: 'feature/existing', path: linked })

    // Creating a worktree runs real git and records the directory.
    const created = (await context.worktreeRegistry.create({ workspaceId, branch: 'feature/new' })).worktree
    expect(created.name).toBe('feature/new')
    expect(git(repo, ['worktree', 'list'])).toContain(created.path)

    // A session created in the new worktree is adopted by cwd (the store
    // announces session/created, which the registry adopts).
    const sessionId = SessionId('session-in-worktree')
    context.sessions.create(sessionId, { meta: { cwd: created.path } })
    let bySession = await context.worktreeRegistry.bySession({ sessionId })
    for (let attempt = 0; attempt < 40 && bySession.worktree === null; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 25))
      bySession = await context.worktreeRegistry.bySession({ sessionId })
    }
    expect(bySession.worktree?.path).toBe(created.path)

    // Deleting removes the git worktree and its record.
    const removed = await context.worktreeRegistry.delete({ workspaceId, worktreeId: created.worktreeId })
    expect(removed.deleted).toBe(true)
    expect(git(repo, ['worktree', 'list'])).not.toContain(created.path)
    const after = await context.worktreeRegistry.list({ workspaceId })
    expect(after.items).toHaveLength(2)

    // Non-git workspaces stay worktree-free.
    const plain = join(root, 'plain')
    mkdirSync(plain)
    const plainWorkspace = await context.workspaceRegistry.create(plain)
    expect((await context.worktreeRegistry.list({ workspaceId: plainWorkspace.id })).items).toEqual([])
  })
})
