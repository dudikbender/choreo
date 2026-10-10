import { useCallback, useState } from 'react'

/** Downloads /api/export/<id> as <id>.pdf. */
export function useExportPdf() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exportPdf = useCallback(async (id: string) => {
    setExporting(true)
    setError(null)
    try {
      const response = await fetch(`/api/export/${id}`)
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Export failed (${response.status})`)
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `${id}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setExporting(false)
    }
  }, [])

  return { exporting, error, exportPdf }
}
