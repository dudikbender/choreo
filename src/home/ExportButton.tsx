import { Link } from '@tanstack/react-router'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { useExportPdf } from './useExportPdf'

/** Downloads a PDF with one page per stop point; on failure, offers the print preview instead. */
export function ExportButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const { exporting, error, exportPdf } = useExportPdf()

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void exportPdf(id)}
        disabled={disabled || exporting}
        title="Download a PDF with one page per stop point"
      >
        {exporting ? <Loader2 className="animate-spin" /> : <Download />}
        {exporting ? 'Exporting…' : 'Export'}
      </Button>
      {error && (
        <div
          role="alert"
          className="absolute top-full right-0 z-10 mt-2 w-72 rounded-lg border border-red-200 dark:border-red-900 bg-background p-3 text-xs text-red-700 dark:text-red-300 shadow-xl"
        >
          {error}{' '}
          <Link to="/studio/$id/print" params={{ id }} className="text-foreground underline hover:text-foreground">
            Open the print view instead
          </Link>
        </div>
      )}
    </div>
  )
}
