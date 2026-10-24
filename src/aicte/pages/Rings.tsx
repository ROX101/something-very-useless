import { useMemo, useState } from 'react'
import { AicteLayout } from '../ui/AicteLayout'
import { Clause, PageTitle, Panel, btn, td, th } from '../../inst/ui/bits'
import { RING, RISK, SAMPLE_ALERTS, WATCHLIST } from '../data'
import { CaseDrawer, StatusText } from './Alerts'
import { statusOf, useCases } from '../store'

const FIRST = ['Rohit', 'Kavita', 'Sandeep', 'Pooja', 'Amit', 'Neha', 'Vikas', 'Anjali', 'Rakesh', 'Sunita', 'Deepak', 'Priya', 'Manoj', 'Rekha', 'Ajay', 'Nisha', 'Sanjay', 'Kiran', 'Arvind']
const LAST = ['Verma', 'Sahu', 'Patel', 'Yadav', 'Dubey', 'Tiwari', 'Sharma', 'Kurre', 'Sen', 'Mishra', 'Raghuwanshi', 'Thakur', 'Lodhi']

function ringStudents() {
  let seed = 932
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  const rows: { name: string; apaar: string; with: string }[] = []
  const add = (n: number, w: string) => {
    for (let i = 0; i < n; i++) {
      const a = String(1000 + Math.floor(rnd() * 8999))
      const z = String(10 + Math.floor(rnd() * 89))
      rows.push({ name: `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`, apaar: `${a} •••• ••${z}`, with: w })
    }
  }
  add(23, 'Trivikram College of Engineering, Raipur')
  add(14, 'Ilavelir Tech College, Coimbatore')
  add(1, 'Aranya Institute of Technology, Nashik')
  return rows
}

export default function Rings() {
  const [showRows, setShowRows] = useState(false)
  const [caseOpen, setCaseOpen] = useState(false)
  const actions = useCases((s) => s.actions)
  const rows = useMemo(ringStudents, [])
  const total = RING.edges.reduce((n, e) => n + e.students, 0)
  const probable = RING.edges.reduce((n, e) => n + e.probable, 0)
  const alert = SAMPLE_ALERTS[0]

  return (
    <AicteLayout>
      <PageTitle title="Duplicate rings" sub="Students with an active enrolment at more than one institution in AY 2026-27" />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel className="min-w-0" title={<span><span className="tnum">{total}</span> students enrolled at two institutions at once</span>}>
          <RingGraph />
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <span className="flex items-center gap-2"><span className="h-0.5 w-6 bg-err" />Same APAAR ID at both institutions</span>
            <span className="flex items-center gap-2"><span className="w-6 border-t-2 border-dashed border-saffron" />{probable} probable duplicates: different APAAR, same name, DOB and parent name</span>
          </div>
        </Panel>

        <Panel title="Institution risk score" className="min-w-0">
          <p className="font-semibold text-ink">{RISK.institution}</p>
          <p className="text-sm text-muted">{RISK.city}, PID {RISK.pid}</p>
          <p className="mt-4 font-serif text-[52px] font-medium leading-none text-err tnum">{RISK.score}<span className="text-2xl text-muted">/100</span></p>
          <ul className="mt-5 space-y-4">
            {RISK.factors.map((f, i) => (
              <li key={f.label} className="animate-[fadeIn_.4s_ease-out_both]" style={{ animationDelay: `${600 + i * 150}ms` }}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-ink">{f.label}{f.clause && <span className="ml-1"><Clause clause={f.clause} /></span>}</span>
                  <span className="font-semibold tnum">+{f.points}</span>
                </div>
                <div className="mt-1.5 h-2 rounded bg-page">
                  <div className="h-2 origin-left animate-[growX_.6s_ease-out_both] rounded bg-navy" style={{ width: `${(f.points / 35) * 100}%`, animationDelay: `${700 + i * 150}ms` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-muted">Rule signals combined with an anomaly model. Each point shows which signal contributed it.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <button className={btn.primary} onClick={() => setCaseOpen(true)}>Refer to Regional Office</button>
            <button className={btn.secondary} onClick={() => setShowRows((v) => !v)}>{showRows ? 'Hide' : 'View'} {total} records</button>
          </div>
          <p className="mt-3 text-sm">Case status: <StatusText s={statusOf(actions, alert.id)} /></p>
        </Panel>
      </div>

      {showRows && (
        <Panel title={`${total} cross-enrolled students at ${RISK.institution}`} className="mt-6" flush>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-[15px]">
              <thead className="sticky top-0 border-b border-line bg-page"><tr><th className={th}>#</th><th className={th}>Student</th><th className={th}>APAAR</th><th className={th}>Also enrolled at</th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-muted tnum">{i + 1}</td>
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-sm">{r.apaar}</td>
                    <td className="px-4 py-2 text-muted">{r.with}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="Risk watch-list" className="mt-6" flush>
        <div className="overflow-x-auto"><table className="w-full text-[15px]">
          <thead className="border-b border-line bg-page/60"><tr><th className={th}>Institution</th><th className={th}>Main signal</th><th className={`${th} w-64`}>Risk score</th></tr></thead>
          <tbody className="divide-y divide-line">
            {WATCHLIST.map((w) => (
              <tr key={w.institution}>
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

      {caseOpen && <CaseDrawer a={alert} onClose={() => setCaseOpen(false)} />}
    </AicteLayout>
  )
}

function RingGraph() {
  const [hover, setHover] = useState<string | null>(null)
  const node = (id: string) => RING.nodes.find((n) => n.id === id)!
  return (
    <svg viewBox="0 0 720 460" className="w-full" role="img" aria-label="Duplicate ring between four institutions">
      {RING.edges.map((e, ei) => {
        const a = node(e.from)
        const b = node(e.to)
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy)
        const nx = -dy / len
        const ny = dx / len
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const dots = Array.from({ length: e.students }, (_, i) => {
          const t = 0.28 + (0.44 * (i + 0.5)) / Math.max(e.students, 1)
          const off = ((i % 3) - 1) * 9
          return { x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off }
        })
        const cx = mx + nx * 52
        const cy = my + ny * 52
        const active = hover === null || hover === e.from || hover === e.to
        return (
          <g key={`${e.from}${e.to}`} opacity={active ? 1 : 0.25} className="transition-opacity">
            <path d={`M${a.x} ${a.y} L${b.x} ${b.y}`} stroke="#B42318" strokeWidth="2" pathLength={1}
              strokeDasharray="1" className="animate-[draw_1.2s_ease-out_both]" style={{ animationDelay: `${ei * 200}ms` }} />
            {e.probable > 0 && (
              <path d={`M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`} fill="none" stroke="#E07B1A" strokeWidth="2" strokeDasharray="6 5"
                className="animate-[fadeIn_.5s_ease-out_both]" style={{ animationDelay: '1.5s' }} />
            )}
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
      {RING.nodes.map((n) => (
        <g key={n.id} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} className="cursor-default">
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.id === 'M' ? '#14235A' : '#FFFFFF'} stroke="#14235A" strokeWidth="2.5" />
          <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize={n.r > 30 ? 15 : 12} fontWeight="600" fill={n.id === 'M' ? '#FFFFFF' : '#14235A'}>{n.id === 'M' ? '87' : n.state}</text>
          <text x={n.x} y={n.y + n.r + 20} textAnchor="middle" fontSize="14" fontWeight="600" fill="#1A2233">{n.short}</text>
          <text x={n.x} y={n.y + n.r + 37} textAnchor="middle" fontSize="12.5" fill="#5B6577">{n.place}</text>
        </g>
      ))}
    </svg>
  )
}
