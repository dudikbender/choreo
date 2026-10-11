import { createContext, createElement, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { createStore, useStore } from 'zustand'
import type { StoreApi } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { poseAt, poseToStyle } from './timeline'
import type { ComponentStyle, ResolvedKeyframe } from './timeline'

type ScrollState = {
  offset: number
  setOffset: (offset: number) => void
}

export type ScrollStore = StoreApi<ScrollState>

const createScrollStore = () =>
  createStore<ScrollState>((set) => ({
    offset: 0,
    setOffset: (offset) => set({ offset }),
  }))

const ScrollStoreContext = createContext<ScrollStore | null>(null)

/** Each presentation tracks its own offset, so several can be mounted without sharing one. */
export function ScrollStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createScrollStore)
  return createElement(ScrollStoreContext.Provider, { value: store }, children)
}

export function useScrollStoreApi(): ScrollStore {
  const store = useContext(ScrollStoreContext)
  if (!store) throw new Error('useScrollStore must be used inside a ScrollStoreProvider')
  return store
}

export function useScrollStore<T>(selector: (state: ScrollState) => T): T {
  return useStore(useScrollStoreApi(), selector)
}

/**
 * Re-renders the caller only when its computed transform/opacity actually
 * changes — a component holding still costs nothing on a scroll tick.
 */
export function useComponentStyle(keyframes: ResolvedKeyframe[]): ComponentStyle {
  return useScrollStore(useShallow((s) => poseToStyle(poseAt(keyframes, s.offset))))
}
