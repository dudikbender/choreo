import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/export/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { exportPdf } = await import('~/server/export')
        const { downloadName } = await import('~/server/workspace')
        try {
          const pdf = await exportPdf(new URL(request.url).origin, params.id)
          return new Response(new Uint8Array(pdf), {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${await downloadName(params.id)}.pdf"`,
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
