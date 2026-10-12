import { utimes } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Tailwind's Vite plugin doesn't rescan @source files created after startup, so
 * classes in freshly generated components would be missing. Touching the
 * stylesheet forces a full Tailwind rebuild that picks them up.
 */
function rescanTailwindOnPresentationChange(): Plugin {
  const presentationsDir = path.resolve('presentations') + path.sep
  const stylesheet = path.resolve('src/styles.css')
  let timer: ReturnType<typeof setTimeout> | undefined

  return {
    name: 'rescan-tailwind-on-presentation-change',
    apply: 'serve',
    configureServer(server) {
      const onFile = (file: string) => {
        if (!file.startsWith(presentationsDir) || !file.endsWith('.tsx')) return
        clearTimeout(timer)
        timer = setTimeout(() => {
          const now = new Date()
          utimes(stylesheet, now, now).catch(() => {})
        }, 100)
      }
      server.watcher.on('add', onFile)
      server.watcher.on('change', onFile)
    },
  }
}

export default defineConfig(({ mode }) => {
  // Vite re-runs this file when .env changes, so the server picks up new keys without a manual restart.
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'ANTHROPIC_'))

  return {
    server: {
      port: 3000,
      // These are only read from disk on request; watching them makes every write reload the page.
      watch: { ignored: ['**/presentations/*/history.jsonl', '**/presentations/*/assets.json'] },
    },
    resolve: {
      tsconfigPaths: true,
    },
    // Only src/server/standalone.ts imports these (to build saved HTML files). The dependency
    // scanner still finds them, and pre-bundling Tailwind's native binary for the browser fails.
    optimizeDeps: { exclude: ['vite', '@tailwindcss/vite'] },
    plugins: [
      tailwindcss(),
      rescanTailwindOnPresentationChange(),
      tanstackStart(),
      // react's vite plugin must come after start's vite plugin
      viteReact(),
    ],
  }
})
