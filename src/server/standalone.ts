import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { presentationSchema } from '~/engine/schema'
import { CONFIG_PATH } from './validate'
import { folderFor, presentationExists } from './workspace'

/** Inside node_modules so the dev server's watcher ignores it and bare imports still resolve. */
const BUILD_ROOT = path.resolve(process.cwd(), 'node_modules/.choreo-save')
const SRC = path.resolve(process.cwd(), 'src')

/**
 * Bundles one presentation into a single self-contained HTML file: the player, React, every
 * component and its imported assets (as data URIs) and the Tailwind CSS they use. It opens
 * straight from disk (file://) with no server, and only reaches the network for remote assets.
 */
export async function saveHtml(id: string): Promise<{ title: string; html: string }> {
  if (!presentationExists(id)) throw new Error(`presentation "${id}" does not exist`)
  const folder = folderFor(id)
  const parsed = presentationSchema.safeParse(JSON.parse(await readFile(path.join(folder, CONFIG_PATH), 'utf8')))
  if (!parsed.success) throw new Error(`Can't save: presentation.json is invalid (${parsed.error.issues[0]?.message})`)
  const config = parsed.data

  const dir = path.join(BUILD_ROOT, `${id}-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  try {
    const files = [...new Set(config.components.map((c) => c.file))]
    const entry = [
      `import { createElement } from 'react'`,
      `import { createRoot } from 'react-dom/client'`,
      `import { Player } from ${JSON.stringify(path.join(SRC, 'standalone/Player.tsx'))}`,
      `import './styles.css'`,
      ...files.map((file, i) => `import C${i} from ${JSON.stringify(path.join(folder, file))}`),
      `const modules = { ${files.map((file, i) => `${JSON.stringify(file)}: C${i}`).join(', ')} }`,
      `const config = ${JSON.stringify(config)}`,
      `createRoot(document.getElementById('root')).render(createElement(Player, { config, modules }))`,
    ].join('\n')
    const css = [
      `@import 'tailwindcss' source(none);`,
      `@source ${JSON.stringify(path.join(folder, 'components'))};`,
      ...['present/stage.tsx', 'present/AutoplayControls.tsx', 'components/ui/button.tsx'].map(
        (file) => `@source ${JSON.stringify(path.join(SRC, file))};`,
      ),
      `@theme inline { --color-ring: oklch(0.556 0 0); }`,
    ].join('\n')
    await writeFile(path.join(dir, 'main.tsx'), entry)
    await writeFile(path.join(dir, 'styles.css'), css)

    const { build } = await import('vite')
    const { default: tailwindcss } = await import('@tailwindcss/vite')
    const output = await build({
      configFile: false,
      root: dir,
      mode: 'production',
      logLevel: 'error',
      envFile: false,
      publicDir: false,
      resolve: { tsconfigPaths: true },
      // The dev server runs with NODE_ENV=development, which would otherwise pick React's and the
      // JSX transform's development builds.
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      oxc: { jsx: { runtime: 'automatic', development: false } },
      plugins: [tailwindcss()],
      build: {
        write: false,
        minify: true,
        cssCodeSplit: false,
        modulePreload: false,
        assetsInlineLimit: () => true,
        rolldownOptions: { input: path.join(dir, 'main.tsx') },
      },
    })

    const results = Array.isArray(output) ? output : [output]
    const items = results.flatMap((result) => ('output' in result ? result.output : []))
    const chunks = items.filter((item) => item.type === 'chunk')
    if (chunks.length !== 1) throw new Error(`Expected one script, got ${chunks.length}`)
    const styles = items
      .filter((item) => item.type === 'asset' && item.fileName.endsWith('.css'))
      .map((item) => (item.type === 'asset' ? String(item.source) : ''))
      .join('\n')

    return { title: config.meta.title, html: page(config.meta.title, config.meta.backgroundColor, styles, chunks[0].code) }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function page(title: string, backgroundColor: string, css: string, js: string): string {
  const escapeHtml = (text: string) =>
    text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  // Inline <script> and <style> end at the first "</script" / "</style", even inside strings.
  const script = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '\\x3C!--')
  const style = css.replace(/<\/style/gi, '<\\/style')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Choreo">
<title>${escapeHtml(title)}</title>
<style>html,body{margin:0;background:${escapeHtml(backgroundColor)}}</style>
<style>${style}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${script}</script>
</body>
</html>
`
}
