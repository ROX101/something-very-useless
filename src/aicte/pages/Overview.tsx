import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { AicteLayout, RULE_NAME } from '../ui/AicteLayout'
import { Clause, CountUp, Notice, PageTitle, Panel, btn, daysUntil, formatDate, td, th } from '../../inst/ui/bits'
import { DEADLINE } from '../../inst/data/reference'
import { withStats } from '../states'
import { AY } from '../data'
import { statusOf, useAllAlerts, useCases, useInsights, useKpis } from '../store'
import { TileMap } from '../ui/TileMap'
import { useApp } from '../../store'

export default function Overview() {
  const k = useKpis()
  const insights = useInsights()
  const alerts = useAllAlerts()
  const actions = useCases((s) => s.actions)
  const days = daysUntil(DEADLINE)
  const account = useApp((s) => s.account)
  const regional = account?.role === 'aicte_regional'

  const states = useMemo(() => withStats(insights.states), [insights.states])
  const watchlist = insights.watchlist.slice(0, 5)
  const top = states.filter((s) => s.institutions > 0).sort((a, b) => b.excessAlerts - a.excessAlerts || b.institutions - a.institutions).slice(0, 10)
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)

  return (
    <AicteLayout>
      <PageTitle title={regional ? 'Regional overview' : 'National overview'} sub={regional ? `${account!.org}, ${account!.scope}, enrolment returns for AY ${AY}` : `Regulation Bureau, enrolment returns for AY ${AY}`} />

      <div className="space-y-6">
        <Notice tone="deadline">
          <strong>Enrolment upload deadline 29 Nov 2026, {days} days left</strong> <span className="ml-2"><Clause clause="2.25(n)" /></span>
        </Notice>

        <div className="grid grid-cols-2 rounded border border-line bg-white lg:grid-cols-4">
          <Kpi label="Institutions in scope" value={k.institutions} note="Registered on APAAR-Sathi" />
          <Kpi label="Returns submitted" value={k.submitted} note={`${pct(k.submitted, k.institutions)}% of institutions`} />
          <Kpi label="Student records received" value={k.records} />
          <Kpi label="APAAR-linked" text={`${k.apaarLinkedPct}%`} note={`${k.exceptionPct}% with an exception code`} />
          <Kpi label="Open compliance alerts" value={k.openAlerts} tone="text-warn" />
          <Kpi label="Cross-institution duplicates" value={k.crossDuplicates} tone="text-err" />
          <Kpi label="Institutions on watch-list" value={insights.watchlist.length} />
          <Kpi label="Days to deadline" value={days} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Panel title="Excess-admission alerts by state" className="min-w-0">
            <TileMap states={states} value={(s) => s.excessAlerts} label="Excess-admission alerts" />
          </Panel>
          <Panel title="States with the most excess-admission alerts" className="min-w-0" flush>
            <div className="overflow-x-auto"><table className="w-full text-[0.9375rem]">
              <thead className="border-b border-line bg-page/60">
                <tr>
                  <th className={th}>State</th>
                  <th className={`${th} text-right`}>Institutions</th>
                  <th className={`${th} text-right`}>Submitted</th>
                  <th className={`${th} text-right`}>Alerts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {!top.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No institutions registered yet.</td></tr>}
                {top.map((s) => (
                  <tr key={s.code}>
                    <td className="px-4 py-2.5">{s.name}</td>
                    <td className="px-4 py-2.5 text-right tnum">{s.institutions.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5 text-right tnum">{pct(s.submitted, s.institutions)}%</td>
                    <td className="px-4 py-2.5 text-right font-semibold tnum">{s.excessAlerts}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Panel>
        </div>

        <Panel title="Latest compliance alerts" actions={<Link to="/aicte/alerts" className={btn.link}>All compliance alerts</Link>} flush>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.9375rem]">
              <thead className="border-b border-line bg-page/60">
                <tr>
                  <th className={th}>Detected</th>
                  <th className={th}>Institution</th>
                  <th className={th}>Alert</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {!alerts.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No compliance alerts yet. They appear here when an institution submits.</td></tr>}
                {alerts.slice(0, 7).map((a) => (
                  <tr key={a.id} className={a.live ? 'bg-warn-bg/60' : ''}>
                    <td className={`${td} whitespace-nowrap text-sm text-muted`}>{formatDate(a.detected)}</td>
                    <td className={td}>
                      <p className="font-semibold">{a.institution}</p>
                      <p className="text-sm text-muted">{a.city}, {a.state}{a.live && <span className="ml-2 font-semibold text-warn">New submission</span>}</p>
                    </td>
                    <td className={td}>
                      <p>{a.title}</p>
                      <p className="text-sm text-muted">{RULE_NAME[a.rule]}</p>
                    </td>
                    <td className={`${td} text-sm`}>{statusOf(actions, a.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Risk watch-list" actions={<Link to="/aicte/rings" className={btn.link}>Open duplicate rings</Link>} flush>
          <div className="overflow-x-auto"><table className="w-full text-[0.9375rem]">
            <thead className="border-b border-line bg-page/60">
              <tr>
                <th className={th}>Institution</th>
                <th className={th}>Main signal</th>
                <th className={`${th} w-64`}>Risk score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!watchlist.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted">No institution has open alerts.</td></tr>}
              {watchlist.map((w) => (
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
      </div>
    </AicteLayout>
  )
}

function Kpi({ label, value, text, note, tone = 'text-ink' }: { label: string; value?: number; text?: string; note?: string; tone?: string }) {
  return (
    <div className="border-b border-r border-line px-5 py-4 [&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(4n)]:border-r-0 lg:[&:nth-child(n+5)]:border-b-0 [&:nth-child(n+7)]:border-b-0">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-[1.625rem] font-semibold leading-tight tnum ${tone}`}>
        {text ?? <CountUp value={value ?? 0} />}
      </p>
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  )
}
