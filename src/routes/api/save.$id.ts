import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/save/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { saveHtml } = await import('~/server/standalone')
        try {
          const { html } = await saveHtml(params.id)
          return new Response(html, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Content-Disposition': `attachment; filename="${params.id}.html"`,
              'Cache-Control': 'no-store',
            },
          })
        } catch (error) {
          return Response.json({ error: (error as Error).message }, { status: 500 })
        }
      },
    },
  },
})
