import { useCallback, useState } from 'react'
import { download } from './download'

/** Downloads /api/export/<id> as <id>.pdf. */
export function useExportPdf() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exportPdf = useCallback(async (id: string) => {
    setExporting(true)
    setError(null)
    try {
      await download(`/api/export/${id}`, `${id}.pdf`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setExporting(false)
    }
  }, [])

  return { exporting, error, exportPdf }
}
