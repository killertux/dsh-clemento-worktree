# dsh-clemento-worktree

Git worktree subdivision for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a **per-worktree session badge** and a **new-session-in-worktree flow**. Installs as an external plugin bundle — no core harness changes.

For a git workspace, this plugin:

- **Badge** — shows the git worktree (branch) the current session runs in, in the session header.
- **New session in worktree…** — a header button opening a chooser: pick a workspace, then either pick an existing worktree (the main worktree included) or enter a new branch name. The new session runs with the worktree as its working directory (`session.create { cwd }` on the existing wire); the plugin adopts it by `cwd` via `session/created`.
- **Auto-discovery** — a workspace that is a git repo gets its main worktree minted and every linked worktree discovered from `git worktree list` (also for workspaces registered after boot, via `domain/changed`).

Non-git workspaces are untouched: no worktree records, no badge, sessions behave exactly as before.

## Install

```sh
dsh plugin --profile web add github:killertux/dsh-clemento-worktree
```

That runs `pnpm add github:killertux/dsh-clemento-worktree` in the `web` profile; because this package declares `dsh.bundle`, `dsh plugin` automatically appends it to the profile's bundle layers. Remove with:

```sh
dsh plugin --profile web remove @killertux/dsh-clemento-worktree
```

Requires DSH `0.1.0-rc.6` (the published `@deepseek-ai/*` peers). The plugin ships committed built artifacts (`lib/`) — no install-time build.

## How it works

One Loader entry (`cordis.patch.yml` → `id: worktree`) mounts the whole feature from the package root:

- `src/git` — the git command seam over `ctx.subprocess`: porcelain `git worktree list` parsing, `worktree add -b <branch>` at a sanitized sibling path, `worktree remove --force`.
- `src/worktree` — the durable `worktree` domain (its own domain name, no conflict with `workspace`), `ctx.worktreeRegistry` (session accounting by canonical `cwd`, the workspace registry's pattern), and a **typert remote** (`worktreeRegistry.list / create / delete / discover / resolve / bySession`) so the browser talks to it without touching `dsh-host-apiproxy`. `lib/typert.host.js` + `lib/typert.remote-client.js` are committed generated artifacts (regenerate via the deepseek-harness dev tree when the remote API changes).
- `src/client` — the badge (static context in `conversation.session.header.actions`) and the chooser. `lib/client.js` is the browser bundle.

### Known behavior

- Sessions created in a linked worktree have a `cwd` different from their workspace path, so the core sidebar shows them under **Ungrouped**; the badge identifies the worktree. The main worktree (cwd == workspace path) behaves exactly as today.
- `worktree.create` supports a new branch at the default sibling path only.
- Deleting a worktree always runs `git worktree remove --force`.

## Development

```sh
pnpm install        # installs deps; node-pty native build is allowed via pnpm-workspace.yaml
pnpm run build      # tsc (host + client) + tsdown client bundle → lib/
pnpm test           # 34 tests: git seam, registry unit, real-Loader composition over real git, UI components
```

The registry unit tests use an in-memory storage backend (`tests/helpers/memory-backend.ts`); the composition test boots a real Loader tree (`cordis.yml`) with the published `@deepseek-ai` packages against a real temporary git repository.

## Layout

```
package.json         # @killertux/dsh-clemento-worktree: dsh.bundle + dsh.client manifests
cordis.patch.yml     # the bundle layer (one entry)
src/                 # source (git seam, worktree registry, client)
lib/                 # committed build output (host ESM, typert artifacts, client.js)
tests/               # 34 tests
build/               # vendored client-bundle helper for tsdown
plan.md              # the design record
```
