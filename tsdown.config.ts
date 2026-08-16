/**
 * Standalone tsdown config: the Host pass is skipped (the node half is the
 * raw tsc ESM output under lib/types, and the typert artifacts are committed
 * generated files — see README for regeneration); the Client pass emits the
 * browser bundle lib/client.js from the compiled client source.
 */
import type { UserConfig } from 'tsdown'
import { clientConfig } from './build/tsdown.client.ts'

export default (inlineConfig: { env?: Record<string, string | undefined> }): UserConfig[] => {
  const face = inlineConfig.env?.DSH_BUILD_FACE
  if (face !== 'client') return [{ entry: '' }]
  return [clientConfig('@killertux/dsk-clemento-worktree', 'lib/types/client/index.js')]
}
