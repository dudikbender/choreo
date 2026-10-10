import { Link } from '@tanstack/react-router'
import { Download, Loader2 } from 'lucide-react'
import { useExportPdf } from './useExportPdf'

/** Downloads a PDF with one page per stop point; on failure, offers the print preview instead. */
export function ExportButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const { exporting, error, exportPdf } = useExportPdf()

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void exportPdf(id)}
        disabled={disabled || exporting}
        title="Download a PDF with one page per stop point"
        className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {exporting ? 'Exporting…' : 'Export'}
      </button>
      {error && (
        <div
          role="alert"
          className="absolute top-full right-0 z-10 mt-2 w-72 rounded-lg border border-red-900 bg-neutral-950 p-3 text-xs text-red-300 shadow-xl"
        >
          {error}{' '}
          <Link to="/studio/$id/print" params={{ id }} className="text-neutral-200 underline hover:text-white">
            Open the print view instead
          </Link>
        </div>
      )}
    </div>
  )
}
