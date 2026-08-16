#!/usr/bin/env node
/**
 * Apply the worktree seam to an installed `@deepseek-ai/dsh-client-ui-conversation`
 * bundle. See scripts/seam.mjs for the edits; this is the manual entry point.
 *
 *   node scripts/patch-conversation-seam.mjs <package-dir>
 *
 * where <package-dir> has a lib/client.js (a pnpm patch dir, the
 * ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-conversation
 * fallback, etc.). Idempotent: re-running reports "already applied".
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { applySeam } from './seam.mjs'

const dir = process.argv[2]
if (dir === undefined) {
  console.error('usage: node scripts/patch-conversation-seam.mjs <package-dir>')
  process.exit(1)
}
const file = join(dir, 'lib', 'client.js')
if (!existsSync(file)) {
  console.error(`no bundle at ${file}`)
  process.exit(1)
}

const code = readFileSync(file, 'utf8')
const result = applySeam(code)
if (result.status === 'already') {
  console.log('seam already applied — nothing to do (re-run only needed after a dsh version bump)')
  process.exit(0)
}
if (result.status === 'mismatch') {
  console.error('seam NOT applied — the installed bundle layout differs; missing anchors:')
  for (const anchor of result.missing) console.error('  - ' + anchor)
  process.exit(1)
}
writeFileSync(file, result.code)
console.log('seam applied (5 edits) — restart the web UI')
