import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { createFileRoute } from '@tanstack/react-router'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  json: 'application/json',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
}

/** Serves asset files for previews in the studio, with range support so videos can seek. */
export const Route = createFileRoute('/api/assets/$id/$name')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { readAssetFile } = await import('~/server/assets')
        const file = await readAssetFile(params.id, params.name).catch(() => null)
        if (!file) return new Response('Not found', { status: 404 })

        const type = MIME[params.name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
        const headers: Record<string, string> = {
          'Content-Type': type,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
          // SVGs can carry scripts; never run them in the studio's origin.
          'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; media-src 'self'",
        }
        const range = request.headers.get('range')?.match(/bytes=(\d*)-(\d*)/)
        if (range && file.size > 0) {
          const start = range[1] ? Number(range[1]) : Math.max(0, file.size - Number(range[2]))
          const end = range[1] && range[2] ? Math.min(Number(range[2]), file.size - 1) : file.size - 1
          if (start > end || start >= file.size) {
            return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } })
          }
          const stream = Readable.toWeb(createReadStream(file.path, { start, end })) as ReadableStream
          return new Response(stream, {
            status: 206,
            headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${file.size}`, 'Content-Length': String(end - start + 1) },
          })
        }
        const stream = Readable.toWeb(createReadStream(file.path)) as ReadableStream
        return new Response(stream, { headers: { ...headers, 'Content-Length': String(file.size) } })
      },
    },
  },
})
