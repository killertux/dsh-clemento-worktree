#!/usr/bin/env node
/**
 * Automatic application of the ui-conversation worktree seam at install time.
 *
 * Resolves the installed `@deepseek-ai/dsh-client-ui-conversation` bundle
 * (through the profile node_modules / fallback walk) and applies the seam
 * edits from scripts/seam.mjs. Idempotent and never fails the install: a
 * bundle whose layout differs only logs a warning (the plugin still works;
 * the workspace chip just falls back to "Choose workspace" for worktree
 * sessions until the seam ships upstream).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { applySeam, applyWorkspaceSeam } from './seam.mjs'

const require = createRequire(import.meta.url)

/** The Harness home: $DSH_HOME, else the OS home's .dsh. */
function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/**
 * Locate the served conversation bundle. pnpm runs `prepare` from a store
 * temp dir before linking the package, so module resolution from this file
 * cannot see the profile — resolve the Harness home fallback mirror (the
 * copy the web server actually serves) directly, and fall back to module
 * resolution for the post-link case.
 */
function findBundle(packageName) {
  const candidates = [
    join(dshHome(), 'profiles', 'node_modules', '@deepseek-ai', packageName, 'lib', 'client.js'),
    join(dshHome(), 'profiles', 'web', 'node_modules', '@deepseek-ai', packageName, 'lib', 'client.js'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  try {
    const manifest = require.resolve(`@deepseek-ai/${packageName}/package.json`)
    const candidate = join(dirname(manifest), 'lib', 'client.js')
    if (existsSync(candidate)) return candidate
  } catch {
    // fall through
  }
  return undefined
}

/** Apply one seam to one bundle; warn-only on mismatch. */
function patch(bundle, apply, label) {
  if (bundle === undefined) {
    console.log(`[dsh-clemento-worktree] ${label} bundle not found (is dsh installed?) — seam not applied`)
    return
  }
  let code
  try {
    code = readFileSync(bundle, 'utf8')
  } catch (error) {
    console.log(`[dsh-clemento-worktree] could not read ${bundle} — seam not applied`)
    return
  }
  const result = apply(code)
  if (result.status === 'already') {
    console.log(`[dsh-clemento-worktree] ${label} worktree seam already applied`)
    return
  }
  if (result.status === 'mismatch') {
    console.warn(`[dsh-clemento-worktree] WARNING: could not apply the ${label} worktree seam (bundle layout differs):`)
    for (const anchor of result.missing) console.warn('  - ' + anchor)
    console.warn('  The workspace chip / sidebar grouping will not reflect worktree sessions until the seam ships upstream.')
    return
  }
  writeFileSync(bundle, result.code)
  console.log(`[dsh-clemento-worktree] applied the ${label} worktree seam — restart the web UI`)
}

patch(findBundle('dsh-client-ui-conversation'), applySeam, 'ui-conversation')
patch(findBundle('dsh-client-ui-workspace'), applyWorkspaceSeam, 'ui-workspace')
