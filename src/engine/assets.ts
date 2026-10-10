import { z } from 'zod'

/** Descriptions and URL-only assets; lives next to presentation.json. */
export const ASSET_MANIFEST = 'assets.json'
export const MAX_ASSET_BYTES = 100 * 1024 * 1024

export const ASSET_KINDS = ['image', 'video', 'audio', 'data', 'document', 'link', 'embed'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

/** Extensions Vite can import as an asset URL (or, for .json, as data). */
const EXTENSION_KINDS: Record<string, AssetKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  avif: 'image',
  svg: 'image',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  aac: 'audio',
  ogg: 'audio',
  json: 'data',
  pdf: 'document',
  txt: 'document',
}

export const UPLOAD_ACCEPT = Object.keys(EXTENSION_KINDS)
  .map((ext) => `.${ext}`)
  .join(',')

export function extensionOf(name: string): string {
  return name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : ''
}

export function kindForFile(name: string): AssetKind | null {
  return EXTENSION_KINDS[extensionOf(name)] ?? null
}

/** Asset files are imported as "../assets/<name>", so names must stay within the import pattern. */
export function safeAssetName(name: string): string {
  const ext = extensionOf(name)
  const base = name
    .slice(0, ext ? -(ext.length + 1) : undefined)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `${base || 'asset'}${ext ? `.${ext}` : ''}`
}

/** Picks `name`, or `name-2`, `name-3`… if it's taken. Case-insensitive, like macOS file systems. */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()))
  if (!used.has(name.toLowerCase())) return name
  const ext = extensionOf(name)
  const base = ext ? name.slice(0, -(ext.length + 1)) : name
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}${ext ? `.${ext}` : ''}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
}

export const assetEntrySchema = z.object({
  /** File name in assets/, or a slug for link/embed assets. */
  name: z.string(),
  kind: z.enum(ASSET_KINDS),
  description: z.string().default(''),
  /** The address of a link/embed, or where a downloaded file came from. */
  url: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  bytes: z.number().optional(),
})
export type AssetEntry = z.infer<typeof assetEntrySchema>

export const isRemote = (asset: AssetEntry) => asset.kind === 'link' || asset.kind === 'embed'

export type UrlPlan =
  | { type: 'download'; kind: AssetKind; name: string }
  | { type: 'embed'; embedUrl: string; name: string }
  | { type: 'link'; name: string }

/**
 * What adding a URL should do: download direct media files, turn video pages into embeds,
 * and keep everything else as a link. Content type (if known) wins over the extension.
 */
export function planUrl(raw: string, contentType?: string | null): UrlPlan {
  const url = new URL(raw)
  const host = url.hostname.replace(/^www\.|^m\./, '')

  const youtubeId =
    host === 'youtu.be'
      ? url.pathname.slice(1)
      : host.endsWith('youtube.com')
        ? url.pathname.startsWith('/embed/') || url.pathname.startsWith('/shorts/')
          ? url.pathname.split('/')[2]
          : url.searchParams.get('v')
        : null
  if (youtubeId) {
    return { type: 'embed', embedUrl: `https://www.youtube.com/embed/${youtubeId}`, name: `youtube-${youtubeId}` }
  }
  const vimeoId = host.endsWith('vimeo.com') ? url.pathname.match(/\/(?:video\/)?(\d+)/)?.[1] : null
  if (vimeoId) return { type: 'embed', embedUrl: `https://player.vimeo.com/video/${vimeoId}`, name: `vimeo-${vimeoId}` }
  const loomId = host.endsWith('loom.com') ? url.pathname.match(/\/(?:share|embed)\/([a-z0-9]+)/i)?.[1] : null
  if (loomId) return { type: 'embed', embedUrl: `https://www.loom.com/embed/${loomId}`, name: `loom-${loomId}` }

  const fileName = decodeURIComponent(url.pathname.split('/').pop() ?? '')
  const typeKind = contentType ? kindForContentType(contentType) : null
  const extKind = kindForFile(fileName)
  const kind = typeKind ?? (contentType && !contentType.startsWith('application/octet-stream') ? null : extKind)
  if (kind && kind !== 'document') {
    const ext = extKind === kind ? extensionOf(fileName) : extensionForContentType(contentType!)
    const base = extKind ? safeAssetName(fileName).replace(/\.[^.]+$/, '') : slugOf(url)
    return { type: 'download', kind, name: `${base || 'download'}.${ext}` }
  }
  return { type: 'link', name: slugOf(url) || 'link' }
}

function slugOf(url: URL): string {
  return `${url.hostname.replace(/^www\./, '')}${url.pathname}`
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
}

const CONTENT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'application/json': 'json',
}

function extensionForContentType(contentType: string): string {
  return CONTENT_TYPES[contentType.split(';')[0].trim().toLowerCase()] ?? 'bin'
}

function kindForContentType(contentType: string): AssetKind | null {
  const ext = CONTENT_TYPES[contentType.split(';')[0].trim().toLowerCase()]
  return ext ? (EXTENSION_KINDS[ext] ?? null) : null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** One line per asset, for Claude. */
export function describeAsset(asset: AssetEntry): string {
  const details = [
    asset.kind,
    asset.width && asset.height ? `${asset.width}×${asset.height}` : null,
    asset.bytes ? formatBytes(asset.bytes) : null,
  ].filter(Boolean)
  const where = isRemote(asset) ? asset.url : `assets/${asset.name}`
  const description = asset.description ? ` — ${asset.description}` : ''
  return `- ${where} (${details.join(', ')})${description}`
}

export function formatAssets(assets: AssetEntry[]): string {
  if (assets.length === 0) return ''
  return [
    '<assets note="Media the designer added to this presentation. Use them where the story or instruction calls for them; view_asset shows you an image.">',
    ...assets.map(describeAsset),
    '</assets>',
  ].join('\n')
}

/** Reads width/height from PNG, GIF, JPEG and WebP headers. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length))
  try {
    if (ascii(1, 3) === 'PNG') return { width: view.getUint32(16), height: view.getUint32(20) }
    if (ascii(0, 3) === 'GIF') return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
      const chunk = ascii(12, 4)
      if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
      if (chunk === 'VP8L') {
        const bits = view.getUint32(21, true)
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
      }
      if (chunk === 'VP8X') {
        const w = bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)
        const h = bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)
        return { width: w + 1, height: h + 1 }
      }
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      let at = 2
      while (at < bytes.length) {
        if (bytes[at] !== 0xff) return null
        const marker = bytes[at + 1]
        const length = view.getUint16(at + 2)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: view.getUint16(at + 7), height: view.getUint16(at + 5) }
        }
        at += 2 + length
      }
    }
  } catch {}
  return null
}
