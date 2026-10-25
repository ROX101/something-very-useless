import { useMemo, useState } from 'react'
import { AicteLayout } from '../ui/AicteLayout'
import { Clause, PageTitle, Panel, btn, maskApaar, td, th } from '../../inst/ui/bits'
import { AY, type Ring, type RingInstitution } from '../data'
import { CaseDrawer, StatusText } from './Alerts'
import { statusOf, useAllAlerts, useCases, useInsights } from '../store'

interface Node extends RingInstitution { x: number; y: number; r: number; students: number }
interface Edge { from: string; to: string; students: number }

const MAX_POINTS = 30

/** The institution that appears in the most cross-enrolments, with every institution it shares students with. */
function focusRing(rings: Ring[]) {
  const count = new Map<string, number>()
  for (const r of rings) {
    count.set(r.from.pid, (count.get(r.from.pid) ?? 0) + r.students.length)
    count.set(r.to.pid, (count.get(r.to.pid) ?? 0) + r.students.length)
  }
  const focusPid = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!focusPid) return null
  const mine = rings.filter((r) => r.from.pid === focusPid || r.to.pid === focusPid)
  const focus = mine[0].from.pid === focusPid ? mine[0].from : mine[0].to
  const partners = mine.map((r) => ({ inst: r.from.pid === focusPid ? r.to : r.from, ring: r }))

  const cx = 360
  const cy = 220
  const total = mine.reduce((n, r) => n + r.students.length, 0)
  const nodes: Node[] = [{ ...focus, x: cx, y: cy, r: 46, students: total }]
  partners.forEach((p, i) => {
    // start on the left and go round, so two partners sit left and right (labels never collide with edges)
    const angle = Math.PI + (2 * Math.PI * i) / partners.length
    nodes.push({ ...p.inst, x: cx + Math.cos(angle) * 270, y: cy + Math.sin(angle) * 160, r: 24 + Math.min(14, p.ring.students.length), students: p.ring.students.length })
  })
  const edges: Edge[] = partners.map((p) => ({ from: focus.pid, to: p.inst.pid, students: p.ring.students.length }))
  const rows = partners.flatMap((p) => p.ring.students.map((s) => ({ ...s, with: `${p.inst.name}, ${p.inst.city}` })))
  return { focus, nodes, edges, rows, total }
}

export default function Rings() {
  const [showRows, setShowRows] = useState(false)
  const [caseOpen, setCaseOpen] = useState(false)
  const actions = useCases((s) => s.actions)
  const { rings, watchlist } = useInsights()
  const alerts = useAllAlerts()
  const view = useMemo(() => focusRing(rings), [rings])

  if (!view) {
    return (
      <AicteLayout>
        <PageTitle title="Duplicate rings" sub={`Students with an active enrolment at more than one institution in AY ${AY}`} />
        <Panel title="No duplicate rings">
          <p className="text-muted">No student is enrolled at two institutions at once. A ring appears here as soon as two submitted returns share an APAAR ID.</p>
        </Panel>
        <WatchList items={watchlist} />
      </AicteLayout>
    )
  }

  const risk = watchlist.find((w) => w.pid === view.focus.pid)
  const alert = alerts.find((a) => a.pid === view.focus.pid && a.rule === 'R10') ?? alerts.find((a) => a.pid === view.focus.pid)

  return (
    <AicteLayout>
      <PageTitle title="Duplicate rings" sub={`Students with an active enrolment at more than one institution in AY ${AY}`} />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel className="min-w-0" title={<span><span className="tnum">{view.total}</span> student{view.total === 1 ? '' : 's'} enrolled at two institutions at once</span>}>
          <RingGraph nodes={view.nodes} edges={view.edges} focusPid={view.focus.pid} score={risk?.risk} />
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <span className="flex items-center gap-2"><span className="h-0.5 w-6 bg-err" />Same APAAR ID at both institutions</span>
          </div>
        </Panel>

        <Panel title="Institution risk score" className="min-w-0">
          <p className="font-semibold text-ink">{view.focus.name}</p>
          <p className="text-sm text-muted">{view.focus.city}{view.focus.state && `, ${view.focus.state}`}, PID {view.focus.pid}</p>
          <p className="mt-4 font-serif text-[3.25rem] font-medium leading-none text-err tnum">{risk?.risk ?? 0}<span className="text-2xl text-muted">/100</span></p>
          {risk ? (
            <ul className="mt-5 space-y-4">
              {risk.factors.map((f, i) => (
                <li key={f.alertId} className="animate-[fadeIn_.4s_ease-out_both]" style={{ animationDelay: `${300 + i * 120}ms` }}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-ink">{f.label}{f.clause && <span className="ml-1"><Clause clause={f.clause} /></span>}</span>
                    <span className="font-semibold tnum">+{f.points}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded bg-page">
                    <div className="h-2 origin-left animate-[growX_.6s_ease-out_both] rounded bg-navy" style={{ width: `${Math.min(100, (f.points / MAX_POINTS) * 100)}%`, animationDelay: `${400 + i * 120}ms` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="mt-5 text-sm text-muted">No open compliance alerts for this institution.</p>}
          <p className="mt-5 text-sm text-muted">Each open alert adds points by rule: cross-enrolment 30, excess admission 25, supernumerary cap 15, NRI cap 10. Capped at 100.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {alert && <button className={btn.primary} onClick={() => setCaseOpen(true)}>Refer to Regional Office</button>}
            <button className={btn.secondary} onClick={() => setShowRows((v) => !v)}>{showRows ? 'Hide' : 'View'} {view.total} record{view.total === 1 ? '' : 's'}</button>
          </div>
          {alert && <p className="mt-3 text-sm">Case status: <StatusText s={statusOf(actions, alert.id)} /></p>}
        </Panel>
      </div>

      {showRows && (
        <Panel title={`Cross-enrolled students at ${view.focus.name}`} className="mt-6" flush>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-[0.9375rem]">
              <thead className="sticky top-0 border-b border-line bg-page"><tr><th className={th}>#</th><th className={th}>Student</th><th className={th}>APAAR</th><th className={th}>Also enrolled at</th></tr></thead>
              <tbody className="divide-y divide-line">
                {view.rows.map((r, i) => (
                  <tr key={`${r.apaar}-${i}`}>
                    <td className="px-4 py-2 text-muted tnum">{i + 1}</td>
                    <td className="px-4 py-2">{r.name ?? 'Not in APAAR registry'}</td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-sm">{maskApaar(r.apaar)}</td>
                    <td className="px-4 py-2 text-muted">{r.with}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <WatchList items={watchlist} />

      {caseOpen && alert && <CaseDrawer a={alert} onClose={() => setCaseOpen(false)} />}
    </AicteLayout>
  )
}

function WatchList({ items }: { items: ReturnType<typeof useInsights>['watchlist'] }) {
  return (
    <Panel title="Risk watch-list" className="mt-6" flush>
      <div className="overflow-x-auto"><table className="w-full text-[0.9375rem]">
        <thead className="border-b border-line bg-page/60"><tr><th className={th}>Institution</th><th className={th}>Main signal</th><th className={`${th} w-64`}>Risk score</th></tr></thead>
        <tbody className="divide-y divide-line">
          {!items.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted">No institution has open alerts.</td></tr>}
          {items.map((w) => (
            <tr key={w.pid}>
              <td className={td}><p className="font-semibold">{w.institution}</p><p className="text-sm text-muted">{w.city}, {w.state}</p></td>
              <td className={`${td} text-muted`}>{w.reason}</td>
              <td className={td}>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 rounded bg-page"><div className="h-2 rounded bg-navy" style={{ width: `${w.risk}%` }} /></div>
                  <span className="w-8 text-right font-semibold tnum">{w.risk}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </Panel>
  )
}

const short = (name: string) => name.split(/\s+/)[0]

function RingGraph({ nodes, edges, focusPid, score }: { nodes: Node[]; edges: Edge[]; focusPid: string; score?: number }) {
  const [hover, setHover] = useState<string | null>(null)
  const node = (pid: string) => nodes.find((n) => n.pid === pid)!
  return (
    <svg viewBox="0 0 720 440" className="w-full" role="img" aria-label={`Duplicate ring between ${nodes.length} institutions`}>
      {edges.map((e, ei) => {
        const a = node(e.from)
        const b = node(e.to)
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy)
        const nx = -dy / len
        const ny = dx / len
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const shown = Math.min(e.students, 40)
        const dots = Array.from({ length: shown }, (_, i) => {
          const t = 0.28 + (0.44 * (i + 0.5)) / Math.max(shown, 1)
          const off = ((i % 3) - 1) * 9
          return { x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off }
        })
        const active = hover === null || hover === e.from || hover === e.to
        return (
          <g key={`${e.from}${e.to}`} opacity={active ? 1 : 0.25} className="transition-opacity">
            <path d={`M${a.x} ${a.y} L${b.x} ${b.y}`} stroke="#B42318" strokeWidth="2" pathLength={1}
              strokeDasharray="1" className="animate-[draw_1.2s_ease-out_both]" style={{ animationDelay: `${ei * 200}ms` }} />
            {dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r="4" fill="#B42318" stroke="#FFFFFF" strokeWidth="1.5"
                className="animate-[fadeIn_.3s_ease-out_both]" style={{ animationDelay: `${300 + ei * 200 + i * 30}ms` }}>
                <title>Student {i + 1}, shared APAAR ID</title>
              </circle>
            ))}
            <g transform={`translate(${mx - nx * 26} ${my - ny * 26})`}>
              <rect x="-17" y="-12" width="34" height="24" rx="4" fill="#FFFFFF" stroke="#B42318" strokeWidth="1.5" />
              <text textAnchor="middle" y="5" fontSize="14" fontWeight="600" fill="#B42318">{e.students}</text>
            </g>
          </g>
        )
      })}
      {nodes.map((n) => {
        const focus = n.pid === focusPid
        return (
          <g key={n.pid} onMouseEnter={() => setHover(n.pid)} onMouseLeave={() => setHover(null)} className="cursor-default">
            <circle cx={n.x} cy={n.y} r={n.r} fill={focus ? '#111111' : '#FFFFFF'} stroke="#111111" strokeWidth="2.5" />
            <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize={n.r > 30 ? 15 : 12} fontWeight="600" fill={focus ? '#FFFFFF' : '#111111'}>
              {focus ? (score ?? n.students) : (n.state || n.students)}
            </text>
            <text x={n.x} y={n.y + n.r + 20} textAnchor="middle" fontSize="14" fontWeight="600" fill="#111111">{short(n.name)}</text>
            <text x={n.x} y={n.y + n.r + 37} textAnchor="middle" fontSize="12.5" fill="#5C5C5C">{n.city}{n.state && `, ${n.state}`}</text>
          </g>
        )
      })}
    </svg>
  )
}
