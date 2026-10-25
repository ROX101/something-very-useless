import { useState } from 'react'
import type { StateRow } from '../states'

export const SEQ = ['#EDEDED', '#C4C4C4', '#9A9A9A', '#5E5E5E', '#111111']

export function binOf(v: number, max: number) {
  if (v === 0) return 0
  return Math.min(4, Math.ceil((v / max) * 4))
}

export function TileMap({ states, value, label }: { states: StateRow[]; value: (s: StateRow) => number; label: string }) {
  const [hover, setHover] = useState<StateRow | null>(null)
  const max = Math.max(...states.map(value))
  const W = 52
  const cols = 11
  const rows = 9
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${cols * W} ${rows * W}`} className="mx-auto block w-full max-w-[560px]" role="img" aria-label={`${label} by state`}>
        {states.map((s) => {
          const v = value(s)
          const b = binOf(v, max)
          const dark = b >= 3
          return (
            <g key={s.code} transform={`translate(${s.x * W + 2} ${s.y * W + 2})`}
              onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)} className="cursor-default">
              <rect width={W - 4} height={W - 4} rx="4" fill={SEQ[b]}
                stroke={hover?.code === s.code ? '#E07B1A' : '#FFFFFF'} strokeWidth={hover?.code === s.code ? 2.5 : 2} />
              <text x={(W - 4) / 2} y={20} textAnchor="middle" fontSize="12" fontWeight="600" fill={dark ? '#FFFFFF' : '#111111'}>{s.code}</text>
              <text x={(W - 4) / 2} y={36} textAnchor="middle" fontSize="11" fill={dark ? '#EDEDED' : '#5C5C5C'}>{v}</text>
            </g>
          )
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute left-2 top-2 rounded border border-line bg-white px-3 py-2 text-sm shadow-md">
          <p className="font-semibold text-ink">{hover.name}</p>
          <p className="text-muted">{hover.institutions.toLocaleString('en-IN')} institutions, {hover.submitted.toLocaleString('en-IN')} submitted</p>
          <p className="text-ink">{value(hover)} {label.toLowerCase()}</p>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 text-sm text-muted">
        <span>Fewer</span>
        {SEQ.map((c) => <span key={c} className="h-3 w-8 rounded-sm" style={{ background: c }} />)}
        <span>More {label.toLowerCase()}</span>
      </div>
    </div>
  )
}
