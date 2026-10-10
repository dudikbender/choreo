import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import type { Browser } from 'playwright-core'
import { ID_PATTERN } from './validate'
import { presentationExists } from './workspace'

const READY_TIMEOUT_MS = 90_000

/** Uses an installed browser rather than downloading one: CHROME_PATH, then Chrome, then Edge. */
async function launch(): Promise<Browser> {
  const executablePath = process.env.CHROME_PATH
  if (executablePath && existsSync(executablePath)) return chromium.launch({ executablePath })
  for (const channel of ['chrome', 'msedge'] as const) {
    try {
      return await chromium.launch({ channel })
    } catch {}
  }
  throw new Error('PDF export needs Google Chrome (or Edge) installed. You can also set CHROME_PATH in .env.')
}

/**
 * Prints /studio/<id>/print — one page per stop point, sized to the stage — to a PDF.
 * Text and shapes stay vector; 3D transforms and filters are rasterized by Chrome.
 */
export async function exportPdf(origin: string, id: string): Promise<Uint8Array> {
  if (!ID_PATTERN.test(id) || !presentationExists(id)) throw new Error(`presentation "${id}" does not exist`)
  const browser = await launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    const failures: string[] = []
    page.on('pageerror', (error) => failures.push(error.message))
    await page.goto(`${origin}/studio/${id}/print?pdf=1`, { waitUntil: 'load', timeout: READY_TIMEOUT_MS })
    try {
      await page.waitForSelector('html[data-print-ready], [data-print-error]', {
        state: 'attached',
        timeout: READY_TIMEOUT_MS,
      })
    } catch {
      throw new Error(`The export page didn't finish loading${failures.length ? `: ${failures[0]}` : ''}`)
    }
    const invalid = await page.$eval('[data-print-error]', (el) => el.getAttribute('data-print-error')).catch(() => null)
    if (invalid) throw new Error(`Can't export: ${invalid}`)
    return await page.pdf({ printBackground: true, preferCSSPageSize: true })
  } finally {
    await browser.close()
  }
}
