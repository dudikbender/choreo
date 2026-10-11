import type { Presentation, Stop } from '~/engine/schema'
import { saveStops } from '~/server/functions'
import type { Flash } from './useNotice'

/**
 * Saves hand-placed stop points (`null` resets to phase starts), mirrors the result into the
 * on-screen config, and flashes `message` or the error.
 */
export async function writeStops({
  presentationId,
  next,
  message,
  onConfigSaved,
  flash,
}: {
  presentationId: string
  next: number[] | null
  message: string
  onConfigSaved: (update: (config: Presentation) => Presentation) => void
  flash: Flash
}): Promise<void> {
  try {
    const report = await saveStops({ data: { id: presentationId, stops: next } })
    if (report.errors.length > 0) {
      flash(report.errors.join(' · '), true)
      return
    }
    const sorted = next && [...new Set(next.map(Math.round))].sort((a, b) => a - b)
    const stops: Stop[] | undefined = sorted?.length ? sorted.map((at) => ({ at })) : undefined
    onConfigSaved((current) => ({ ...current, stops }))
    flash(message)
  } catch (error) {
    flash((error as Error).message, true)
  }
}
