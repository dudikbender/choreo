import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ASSET_MANIFEST,
  MAX_ASSET_BYTES,
  assetEntrySchema,
  extensionOf,
  imageSize,
  isRemote,
  kindForFile,
  planUrl,
  safeAssetName,
  uniqueName,
} from '~/engine/assets'
import type { AssetEntry } from '~/engine/assets'
import { appendHistory, folderFor, listPresentations, presentationExists, readEditableFiles } from './workspace'

const ASSET_NAME = /^[A-Za-z0-9_.-]+$/

function assetsDir(id: string): string {
  return path.join(folderFor(id), 'assets')
}

function assetPath(id: string, name: string): string {
  if (!ASSET_NAME.test(name) || name.startsWith('.')) throw new Error(`invalid asset name "${name}"`)
  return path.join(assetsDir(id), name)
}

async function readManifest(id: string): Promise<AssetEntry[]> {
  const file = path.join(folderFor(id), ASSET_MANIFEST)
  if (!existsSync(file)) return []
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'))
    return Array.isArray(raw) ? raw.flatMap((entry) => assetEntrySchema.safeParse(entry).data ?? []) : []
  } catch {
    return []
  }
}

async function writeManifest(id: string, entries: AssetEntry[]): Promise<void> {
  await writeFile(path.join(folderFor(id), ASSET_MANIFEST), `${JSON.stringify(entries, null, 2)}\n`)
}

/**
 * Every asset of a presentation: files in assets/ (described by the manifest when it has an
 * entry, so files dropped in by hand still show up) plus link/embed entries.
 */
export async function listAssetEntries(id: string): Promise<AssetEntry[]> {
  if (!presentationExists(id)) return []
  const manifest = await readManifest(id)
  const dir = assetsDir(id)
  const files = existsSync(dir) ? (await readdir(dir)).filter((name) => !name.startsWith('.')).sort() : []
  const fromFiles = await Promise.all(
    files.map(async (name) => {
      const known = manifest.find((entry) => entry.name === name && !isRemote(entry))
      if (known) return known
      const file = path.join(dir, name)
      const bytes = (await stat(file)).size
      const kind = kindForFile(name) ?? 'document'
      const size = kind === 'image' && bytes < 20 * 1024 * 1024 ? imageSize(await readFile(file)) : null
      return { name, kind, description: '', bytes, ...(size ?? {}) } satisfies AssetEntry
    }),
  )
  return [...fromFiles, ...manifest.filter(isRemote)]
}

async function upsert(id: string, entry: AssetEntry): Promise<void> {
  const manifest = await readManifest(id)
  const next = manifest.filter((e) => e.name !== entry.name)
  next.push(entry)
  await writeManifest(id, next)
}

async function takenNames(id: string): Promise<string[]> {
  return (await listAssetEntries(id)).map((e) => e.name)
}

/** Writes an uploaded (or downloaded) file into assets/, deduplicating its name. */
export async function saveAssetFile(
  id: string,
  fileName: string,
  bytes: Uint8Array,
  extra: Partial<AssetEntry> = {},
): Promise<AssetEntry> {
  if (!presentationExists(id)) throw new Error(`presentation "${id}" does not exist`)
  const kind = kindForFile(fileName)
  if (!kind) throw new Error(`.${extensionOf(fileName) || '?'} files aren't supported`)
  if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error(`${fileName} is larger than 100 MB`)

  const name = uniqueName(safeAssetName(fileName), await takenNames(id))
  await mkdir(assetsDir(id), { recursive: true })
  await writeFile(assetPath(id, name), bytes)
  const size = kind === 'image' ? imageSize(bytes) : null
  const entry: AssetEntry = { description: '', ...extra, name, kind, bytes: bytes.byteLength, ...(size ?? {}) }
  await upsert(id, entry)
  return entry
}

/** Downloads direct media links; keeps video pages as embeds and everything else as links. */
export async function addUrlAsset(id: string, url: string, description = ''): Promise<AssetEntry> {
  if (!presentationExists(id)) throw new Error(`presentation "${id}" does not exist`)
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Only http(s) links are supported')

  let plan = planUrl(url)
  let response: Response | null = null
  if (plan.type !== 'embed') {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      // Some hosts (Wikimedia, many CDNs) refuse requests without a browser-like agent.
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) scroll-presentation-builder/1.0', Accept: '*/*' },
    }).catch(() => null)
    if (response?.ok) plan = planUrl(url, response.headers.get('content-type'))
    else if (plan.type === 'download') {
      throw new Error(`Couldn't download that file (${response ? `HTTP ${response.status}` : 'no response'})`)
    }
  }

  if (plan.type === 'download' && response?.ok) {
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > MAX_ASSET_BYTES) throw new Error('That file is larger than 100 MB')
    const bytes = new Uint8Array(await response.arrayBuffer())
    return saveAssetFile(id, plan.name, bytes, { url, description })
  }

  const title = plan.type === 'link' && response?.ok ? await pageTitle(response) : null
  const entry: AssetEntry = {
    name: uniqueName(plan.name, await takenNames(id)),
    kind: plan.type === 'embed' ? 'embed' : 'link',
    url: plan.type === 'embed' ? plan.embedUrl : url,
    description: description || title || '',
  }
  await upsert(id, entry)
  return entry
}

async function pageTitle(response: Response): Promise<string | null> {
  if (!response.headers.get('content-type')?.includes('text/html')) return null
  const html = (await response.text()).slice(0, 200_000)
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match ? decodeEntities(match[1].trim()).slice(0, 200) || null : null
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

export async function describeAssetEntry(id: string, name: string, description: string): Promise<void> {
  const entry = (await listAssetEntries(id)).find((e) => e.name === name)
  if (!entry) throw new Error(`asset "${name}" does not exist`)
  await upsert(id, { ...entry, description: description.trim().slice(0, 1000) })
}

/** Components that import an asset file (or contain a link/embed URL). */
export async function assetUsers(id: string, entry: AssetEntry): Promise<string[]> {
  const files = await readEditableFiles(id)
  const needle = isRemote(entry) ? entry.url! : `../assets/${entry.name}`
  return Object.entries(files)
    .filter(([file, source]) => file.startsWith('components/') && source.includes(needle))
    .map(([file]) => file)
}

export async function removeAssetEntry(id: string, name: string): Promise<{ error?: string }> {
  const entry = (await listAssetEntries(id)).find((e) => e.name === name)
  if (!entry) return { error: `asset "${name}" does not exist` }
  const users = await assetUsers(id, entry)
  if (users.length > 0) return { error: `Still used by ${users.join(', ')}. Remove it there first.` }
  if (!isRemote(entry)) await rm(assetPath(id, name), { force: true })
  await writeManifest(id, (await readManifest(id)).filter((e) => e.name !== name))
  await appendHistory(id, {
    kind: 'manual-edit',
    outcome: 'manual',
    request: `Removed the asset ${isRemote(entry) ? entry.url : `assets/${name}`}.`,
  })
  return {}
}

export async function copyAssetEntry(fromId: string, name: string, toId: string): Promise<AssetEntry> {
  const entry = (await listAssetEntries(fromId)).find((e) => e.name === name)
  if (!entry) throw new Error(`asset "${name}" does not exist in ${fromId}`)
  if (!presentationExists(toId)) throw new Error(`presentation "${toId}" does not exist`)
  const copy = { ...entry, name: uniqueName(entry.name, await takenNames(toId)) }
  if (!isRemote(entry)) {
    await mkdir(assetsDir(toId), { recursive: true })
    await copyFile(assetPath(fromId, entry.name), assetPath(toId, copy.name))
  }
  await upsert(toId, copy)
  return copy
}

/** Assets in every other presentation, for reuse. */
export async function listOtherAssets(id: string): Promise<{ presentation: string; title: string; assets: AssetEntry[] }[]> {
  const presentations = await listPresentations()
  const groups = await Promise.all(
    presentations
      .filter((p) => p.id !== id)
      .map(async (p) => ({ presentation: p.id, title: p.title ?? p.id, assets: await listAssetEntries(p.id) })),
  )
  return groups.filter((g) => g.assets.length > 0)
}

export async function readAssetFile(id: string, name: string): Promise<{ path: string; size: number } | null> {
  const file = assetPath(id, name)
  if (!existsSync(file)) return null
  return { path: file, size: (await stat(file)).size }
}
