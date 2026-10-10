import type { CSSProperties } from 'react'

export default function HeroTitle({ style }: { style: CSSProperties }) {
  return (
    <div style={style} className="text-center">
      <p className="text-3xl font-semibold tracking-[0.3em] text-emerald-600 uppercase">Q3 2026</p>
      <h1 className="mt-6 text-[10rem] leading-none font-bold tracking-tight text-neutral-900">
        Quarterly Vision
      </h1>
      <p className="mt-8 text-4xl text-neutral-500">Where we grew, and who made it happen.</p>
    </div>
  )
}
