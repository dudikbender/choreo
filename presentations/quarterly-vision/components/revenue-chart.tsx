import type { CSSProperties } from 'react'

const quarters = [
  { label: 'Q4 ’25', value: 1.8 },
  { label: 'Q1 ’26', value: 2.4 },
  { label: 'Q2 ’26', value: 3.1 },
  { label: 'Q3 ’26', value: 4.6 },
]

const max = Math.max(...quarters.map((q) => q.value))

export default function RevenueChart({ style }: { style: CSSProperties }) {
  return (
    <div
      style={style}
      className="w-[1100px] rounded-3xl border border-neutral-200 bg-white/90 p-14 shadow-2xl shadow-neutral-300/60"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-5xl font-semibold text-neutral-900">Revenue</h2>
        <span className="rounded-full bg-emerald-100 px-5 py-2 text-3xl font-semibold text-emerald-700">+48% QoQ</span>
      </div>
      <div className="mt-12 flex h-[420px] items-end gap-10">
        {quarters.map((q) => (
          <div key={q.label} className="flex flex-1 flex-col items-center gap-4">
            <span className="text-2xl font-medium text-neutral-700">${q.value}M</span>
            <div
              className="w-full rounded-t-xl bg-gradient-to-t from-emerald-500 to-lime-300"
              style={{ height: `${(q.value / max) * 320}px` }}
            />
            <span className="text-xl text-neutral-500">{q.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
