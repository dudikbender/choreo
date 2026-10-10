import type { CSSProperties } from 'react'

export default function PieCaption({ style }: { style: CSSProperties }) {
  return (
    <div style={style} className="w-[1400px] text-center">
      <p className="text-7xl font-bold tracking-tight text-neutral-900">Plenty of pie to go around!</p>
    </div>
  )
}
