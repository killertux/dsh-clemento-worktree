# dsh-clemento-worktree

Git worktree subdivision for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a **per-worktree session badge** and a **worktree selector flow**. Installs as an external plugin bundle — no core harness changes.

For a git workspace, this plugin:

- **Badge** — shows the git worktree (branch) the current session runs in, in the session header.
- **Select worktree…** — a header button opening a chooser: pick a workspace, then either pick an existing worktree (the main worktree included) or enter a new branch name. The new session runs with the worktree as its working directory (`session.create { cwd }` on the existing wire); the plugin adopts it by `cwd` via `session/created`.
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

- Sessions created in a linked worktree have a `cwd` different from their workspace path, so the core sidebar would show them under **Ungrouped**; the ui-workspace seam re-homes them into their owning workspace group, and the badge identifies the worktree. The main worktree (cwd == workspace path) behaves exactly as today.
- `worktree.create` supports a new branch at the default sibling path only.
- Deleting a worktree always runs `git worktree remove --force`.

## Development

```sh
pnpm install        # installs deps; node-pty native build is allowed via pnpm-workspace.yaml
pnpm run build      # tsc (host + client) + tsdown client bundle → lib/
pnpm test           # 37 tests: git seam, registry unit, real-Loader composition over real git, UI components
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

## Workspace selector + worktree dropdown (applied automatically)

The plugin's `prepare` script applies the ui-conversation seam at install
time (`scripts/postinstall.mjs` → `scripts/seam.mjs`): it resolves the
installed `@deepseek-ai/dsh-client-ui-conversation` bundle and adds

- the `worktreeWorkspaceOf` mapping to the workspace chip's resolution, so a
  session running in a linked git worktree keeps its workspace selected;
- a `conversation.hero.actions` root-scoped slot in the start-page hero row,
  where the plugin renders its worktree dropdown right of the workspace
  selector.

It also patches `@deepseek-ai/dsh-client-ui-workspace` so the sidebar groups
worktree sessions under their owning workspace instead of Ungrouped (the
plugin caches the full session→workspace mapping via the
`worktreeRegistry.mapBySessions` remote).

pnpm blocks install scripts unless allowed, so allow the plugin's once:

```yaml
# /home/bruno/.dsh/profiles/web/pnpm-workspace.yaml
allowBuilds:
  '@killertux/dsh-clemento-worktree': true
```

Then update the plugin and restart the web UI:

```sh
npx @deepseek-ai/dsh plugin --profile web remove @killertux/dsh-clemento-worktree
npx @deepseek-ai/dsh plugin --profile web add github:killertux/dsh-clemento-worktree
```

The postinstall is idempotent and never fails the install: if the bundle
layout differs (a dsh version bump), it logs a warning and the plugin still
works — the chip just falls back to "Choose workspace" until the seam ships
upstream. Before writing a patched bundle the postinstall now **executes it
through a stubbed module loader** (`bundleExecutes` in `scripts/seam.mjs`) and
refuses to write a bundle that cannot register, so a broken seam can no
longer land silently. `scripts/patch-conversation-seam.mjs` is the manual
entry point, `patches/dsh-client-ui-conversation.patch` is the pristine→
patched diff for the `patchedDependencies` alternative, and
`scripts/restore-workspace-seam.mjs` reverses every ui-workspace seam edit
(including the signatures and the pass-through, and repairs the mangled
spread a broken early seam version inserted) — run it against
`/home/bruno/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-workspace`
if the web UI fails to load that bundle. `scripts/verify-seam.mjs` is the
read-only check: it applies the seam in memory, asserts the markers,
executes the patched bundle, and runs a behavioral test of the rehome logic
(worktree sessions land in their owning workspace, orphans stay in
Ungrouped).

## Known behavior

- Sessions created in a linked worktree have a `cwd` different from their workspace path, so the core sidebar would show them under **Ungrouped**; the ui-workspace seam re-homes them into their owning workspace group, and the badge identifies the worktree. The main worktree (cwd == workspace path) behaves exactly as today.
- `worktree.create` supports a new branch at the default sibling path only.
- Deleting a worktree always runs `git worktree remove --force`.

## Development

```sh
pnpm install        # installs deps; node-pty native build is allowed via pnpm-workspace.yaml
pnpm run build      # tsc (host + client) + tsdown client bundle → lib/
pnpm test           # 37 tests: git seam, registry unit, real-Loader composition over real git, UI components
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

## Workspace selector keeps the workspace for worktree sessions

A session running in a linked git worktree has a `cwd` different from its
workspace path, so the workspace chip (which matches the workspace session
account) would fall back to "Choose workspace". The plugin provides a
`ctx.worktreeWorkspace` session→workspace mapping service, and a small
additive seam in `ui-conversation` makes the chip consult it. The seam is
upstream-ready in the dev clone; until it ships in a dsh release, apply it to
the installed bundle once per dsh update:

The core packages are not profile dependencies (they come from the dsh
installation, mirrored as symlinks under `~/.dsh/profiles/node_modules`), so
`pnpm patch` / `patchedDependencies` can't see them. Patch the served copy
directly instead:

```sh
node <repo>/scripts/patch-conversation-seam.mjs   /home/bruno/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-conversation
```

Re-run whenever the dsh version bumps (the copy lives in the npx cache; the
script verifies each anchor exactly once and refuses to corrupt a changed
bundle). The seam is upstream-ready in the dev clone for when it ships.

For a durable patch that survives version bumps, add the package as a direct
profile dependency first, then register the bundled patch:

```sh
cd /home/bruno/.dsh/profiles/web
pnpm add @deepseek-ai/dsh-client-ui-conversation@0.1.0-rc.6
# pnpm-workspace.yaml:
#   patchedDependencies:
#     '@deepseek-ai/dsh-client-ui-conversation@0.1.0-rc.6': patches/dsh-client-ui-conversation.patch
pnpm install
```

