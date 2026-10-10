import type { CSSProperties } from 'react'

const people = [
  { name: 'Ada Park', role: 'Engineering', color: 'bg-lime-300' },
  { name: 'Jonas Reyes', role: 'Design', color: 'bg-emerald-300' },
  { name: 'Mira Okafor', role: 'Sales', color: 'bg-teal-200' },
  { name: 'Theo Lind', role: 'Operations', color: 'bg-cyan-200' },
]

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')

export default function TeamCard({ style }: { style: CSSProperties }) {
  return (
    <div style={style} className="w-[1300px] text-center">
      <h2 className="text-7xl font-bold text-neutral-900">The people behind the curve</h2>
      <div className="mt-16 grid grid-cols-4 gap-10">
        {people.map((person) => (
          <div
            key={person.name}
            className="rounded-3xl border border-neutral-200 bg-white p-10 shadow-xl shadow-neutral-300/50"
          >
            <div
              className={`mx-auto grid size-32 place-items-center rounded-full text-4xl font-bold text-neutral-900 ${person.color}`}
            >
              {initials(person.name)}
            </div>
            <div className="mt-6 text-3xl font-semibold text-neutral-900">{person.name}</div>
            <div className="mt-2 text-2xl text-neutral-500">{person.role}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
