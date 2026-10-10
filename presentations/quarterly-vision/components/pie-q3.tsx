import type { CSSProperties } from 'react'

const data = [1.8, 2.4, 3.1, 4.6]
const INDEX = 3
const LABEL = 'Q3 ’26'
const COLOR = '#a3e635'

const R = 290
const C = 300

function point(deg: number, r: number) {
  const rad = (deg * Math.PI) / 180
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)]
}

export default function PieQ3({ style }: { style: CSSProperties }) {
  const total = data.reduce((a, b) => a + b, 0)
  const before = data.slice(0, INDEX).reduce((a, b) => a + b, 0)
  const start = -90 + (before / total) * 360
  const sweep = (data[INDEX] / total) * 360
  const end = start + sweep
  const [x1, y1] = point(start, R)
  const [x2, y2] = point(end, R)
  const [lx, ly] = point(start + sweep / 2, R * 0.62)
  const d = `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2} Z`
  return (
    <div style={style} className="h-[600px] w-[600px]">
      <svg viewBox="0 0 600 600" className="h-full w-full overflow-visible">
        <path d={d} fill={COLOR} stroke="#ffffff" strokeWidth="6" strokeLinejoin="round" />
        <text x={lx} y={ly - 6} textAnchor="middle" fontSize="38" fontWeight="700" fill="#171717">
          ${data[INDEX]}M
        </text>
        <text x={lx} y={ly + 30} textAnchor="middle" fontSize="24" fontWeight="500" fill="#171717" opacity="0.75">
          {LABEL}
        </text>
      </svg>
    </div>
  )
}
