# Plan: Git Worktree Subdivision for DeepSeek Harness

Status: **implemented — standalone plugin repo, installable via `dsh plugin --profile web add github:killertux/dsh-clemento-worktree`**

## Direction (final, per user decisions)

A **standalone plugin repository** at this workspace root, shaped like
[`github.com/liustack/modlens`](https://github.com/liustack/modlens) — one npm
package with a `dsh.bundle` manifest, a `cordis.patch.yml`, and committed
built artifacts. No deepseek-harness core rewrites; no code inside the harness
folder (the harness source lives in a sibling dev clone,
`~/Projects/dsh-harness-dev`, used to regenerate the typert artifacts).

- **Badge with the worktree name** in the session header
  (`conversation.session.header.actions`, static context).
- **New-session flow**: pick a workspace, then an existing worktree (main
  included) or a new branch name; the session starts in that worktree
  (`session.create { cwd }` on the existing wire).
- Non-git workspaces behave exactly as today.

## Confirmed design decisions

| Topic | Decision |
|---|---|
| Main worktree | The workspace directory is the **main worktree** (`isMain`, path == workspace path); every session belongs to a worktree. |
| Create | Enter a branch name → `git worktree add -b <branch>` at the default sibling path. |
| Delete | `git worktree remove --force`. |
| Discovery | Auto-discover from `git worktree list` at bootstrap and when a workspace is registered (`domain/changed`). |
| Integration | **Standalone plugin merged into one package; zero core rewrites.** |

## Package layout (this repo)

- `package.json` — `@killertux/dsh-clemento-worktree`; `dsh.bundle.patch` →
  `./cordis.patch.yml`; `dsh.client` manifest; exports `.` (host entry),
  `./types`, `./typert`, `./remote`, `./client`; `files: [lib, cordis.patch.yml, README.md]`.
- `cordis.patch.yml` — one row `id: worktree` → the package root, a function
  plugin that mounts the git seam (`ctx.worktreeGit`) then the registry
  (`ctx.worktreeRegistry`); the `dsh.client` manifest registers the browser half.
- `src/`
  - `git/` — git command seam over `ctx.subprocess`: porcelain
    `worktree list` parsing, `worktree add -b <branch>` (sanitized sibling
    path, collision suffixing), `worktree remove --force`, branch/detached
    detection; `GitCommandError`.
  - `worktree/` — durable `worktree` domain (own domain name, so no
    single-open conflict with `workspace`), `Worktree` entity, and
    `WorktreeRegistry` (a `TypertRemoteService`): session accounting by
    canonical `cwd`, adoption via `session/created`, and workspace-registration
    reaction via `domain/changed`. Remotes: `list`, `create`, `delete`,
    `discover`, `resolve`, `bySession` (package-owned request/result wrapper
    types — the typert boundary rule).
  - `client/` — badge + worktree selector chooser; session creation via
    `ctx.get('connection').api.sessions.create({ cwd })` then
    `ctx.sessions.open`.
  - `index.ts` (root plugin), `invariant.ts`.
- `lib/` — committed build output: raw tsc ESM (`.` → `lib/types/index.js`),
  the generated typert artifacts (`lib/typert.host.js` /
  `lib/typert.remote-client.js` + `.d.ts`, renamed to this package), and the
  browser bundle (`lib/client.js`). No install-time build (`prepare` is
  deliberately absent — modlens-style committed artifacts).
- `build/` — vendored client-bundle helper (from the harness `clientBundle`,
  with the generated-remote regex extended for this package name).
- `tests/` — 34 tests (git seam 12, registry unit 14, real-Loader composition
  over real git 1, UI components 7) against the **published** `@deepseek-ai`
  packages.

## Build

```sh
pnpm install          # devDeps incl. @deepseek-ai/dsh-typert-generator (not used at build today)
npm run build         # tsc -b tsconfig.json && tsc -b tsconfig.client.json && tsdown --env.DSH_BUILD_FACE client
pnpm test             # vitest (standard-decorator transform plugin in vitest.config.ts)
```

The typert artifacts are generated in the harness dev tree
(`~/Projects/dsh-harness-dev`, where all packages are registered) and ported
with the package-name rename; the standalone generator is not used because it
only registers packages under a `packages/` layout. Regenerate by editing the
mirror packages in the dev clone, running its host tsdown, and re-porting
`lib/typert.*` with `s/@deepseek-ai\/dsh-worktree/@killertux\/dsh-clemento-worktree/g`.

## Verification

- [x] 34/34 tests green in the standalone repo (fresh `pnpm install` with
      committed `lib/` intact).
- [x] `dsh plugin --profile scratch add <repo path>` installs the package and
      auto-reconciles it into `dsh.profile.bundles`;
      `dsh --profile scratch --dump-config` composes the `worktree` row.
- [x] Host/client `tsc` clean; tsdown client bundle builds.
- [ ] Push to `github:killertux/dsh-clemento-worktree` and run
      `dsh plugin --profile web add github:killertux/dsh-clemento-worktree`,
      then a browser smoke (badge + chooser) on a real multi-worktree repo.

## Known behavior / limitations

- Sessions in linked worktrees show under **Ungrouped** in the core sidebar
  (cwd ≠ workspace path); the badge identifies the worktree.
- `worktree.create` supports a new branch at the default sibling path only.
- Deleting always runs `git worktree remove --force`.
