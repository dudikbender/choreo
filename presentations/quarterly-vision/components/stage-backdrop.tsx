import type { CSSProperties } from 'react'

export default function StageBackdrop({ style }: { style: CSSProperties }) {
  return (
    <div
      style={style}
      className="relative h-[1080px] w-[1920px] overflow-hidden bg-gradient-to-br from-amber-50 via-white to-lime-50"
    >
      <div className="absolute -left-40 -top-40 size-[700px] rounded-full bg-lime-200/40 blur-3xl" />
      <div className="absolute -bottom-52 -right-32 size-[800px] rounded-full bg-sky-200/40 blur-3xl" />
      <div className="absolute left-1/2 top-1/3 size-[500px] rounded-full bg-amber-100/50 blur-3xl" />
    </div>
  )
}
