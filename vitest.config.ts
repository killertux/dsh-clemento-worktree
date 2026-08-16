import { resolve } from 'node:path'
import ts from 'typescript'
import { defineConfig } from 'vitest/config'

const decoratorSyntax = /^\s*@[A-Za-z_$][\w$]*/m

/** Lower standard TypeScript decorators before Vite's default parser sees source files. */
function standardDecoratorPlugin() {
  return {
    name: 'dsh-standard-decorators',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const file = id.split('?', 1)[0] ?? ''
      if (!/\.[cm]?tsx?$/.test(file) || !decoratorSyntax.test(code)) return
      const result = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2024,
          module: ts.ModuleKind.ESNext,
          jsx: file.endsWith('x') ? ts.JsxEmit.ReactJSX : undefined,
          sourceMap: true,
        },
      })
      return {
        code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
        map: result.sourceMapText,
      }
    },
  }
}

export default defineConfig({
  plugins: [standardDecoratorPlugin()],
  resolve: {
    alias: {
      // Self-subpath imports resolve to source for tests; the remote is the
      // committed generated artifact.
      '@killertux/dsh-clemento-worktree/types': resolve(import.meta.dirname, 'src/worktree/types.ts'),
      '@killertux/dsh-clemento-worktree/remote': resolve(import.meta.dirname, 'lib/typert.remote-client.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
  },
})
