import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/generate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { generate, generateRequestSchema } = await import('~/server/generate')
        const parsed = generateRequestSchema.safeParse(await request.json())
        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
        }

        const encoder = new TextEncoder()
        const abort = new AbortController()
        request.signal.addEventListener('abort', () => abort.abort())
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            const emit = (event: unknown) => {
              if (!abort.signal.aborted) {
                controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
              }
            }
            try {
              await generate(parsed.data, emit, abort.signal)
            } catch (error) {
              emit({ type: 'error', message: (error as Error).message })
            } finally {
              if (!abort.signal.aborted) controller.close()
            }
          },
          cancel() {
            abort.abort()
          },
        })

        return new Response(body, {
          headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
        })
      },
    },
  },
})
