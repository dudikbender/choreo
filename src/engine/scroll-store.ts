import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { poseAt, poseToStyle } from './timeline'
import type { ComponentStyle, ResolvedKeyframe } from './timeline'

type ScrollState = {
  offset: number
  setOffset: (offset: number) => void
}

export const useScrollStore = create<ScrollState>((set) => ({
  offset: 0,
  setOffset: (offset) => set({ offset }),
}))

/**
 * Re-renders the caller only when its computed transform/opacity actually
 * changes — a component holding still costs nothing on a scroll tick.
 */
export function useComponentStyle(keyframes: ResolvedKeyframe[]): ComponentStyle {
  return useScrollStore(useShallow((s) => poseToStyle(poseAt(keyframes, s.offset))))
}
