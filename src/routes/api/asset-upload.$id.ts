import { createFileRoute } from '@tanstack/react-router'

/** Multipart upload of one or more files into a presentation's assets/. */
export const Route = createFileRoute('/api/asset-upload/$id')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { saveAssetFile } = await import('~/server/assets')
        const form = await request.formData().catch(() => null)
        const files = form?.getAll('file').filter((value): value is File => value instanceof File) ?? []
        if (files.length === 0) return Response.json({ error: 'No files received' }, { status: 400 })

        const saved = []
        const errors = []
        for (const file of files) {
          try {
            saved.push(await saveAssetFile(params.id, file.name, new Uint8Array(await file.arrayBuffer())))
          } catch (error) {
            errors.push(`${file.name}: ${(error as Error).message}`)
          }
        }
        return Response.json({ saved, errors }, { status: saved.length ? 200 : 400 })
      },
    },
  },
})
