import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { audit } from '../../audit/log'
import { AicteLayout } from '../ui/AicteLayout'
import { Clause, PageTitle, Panel, btn, formatDate, td, th } from '../../inst/ui/bits'
import { withStats, type StateRow } from '../states'
import { AY } from '../data'
import { useAllAlerts, useInsights } from '../store'
import { sha256 } from '../../inst/store'
import { api as http } from '../../api'
import { useApp } from '../../store'

type Kind = 'submission' | 'apaar' | 'excess' | 'nirf' | 'aishe' | 'nba'
const SERVER_KINDS: Kind[] = ['nirf', 'aishe', 'nba']

const KINDS: { id: Kind; label: string }[] = [
  { id: 'submission', label: 'State-wise submission of enrolment returns' },
  { id: 'apaar', label: 'APAAR coverage by state' },
  { id: 'excess', label: 'Excess-admission register' },
  { id: 'nirf', label: 'NIRF: sanctioned intake and total actual student strength' },
  { id: 'aishe', label: 'AISHE: enrolment by gender and social category' },
  { id: 'nba', label: 'NBA SAR: enrolment ratio (N1 + N4) / N' },
]

const select = 'h-10 w-full rounded border border-line bg-white px-3 text-[0.9375rem] text-ink focus:outline-none focus:ring-2 focus:ring-navy/30'

interface Report {
  kind: Kind
  title: string
  generatedAt: string
  notes?: string[]
  hash: string
  header: string[]
  rows: (string | number)[][]
  chart?: { label: string; value: number; max: number; unit: string }[]
}

export default function Reports() {
  const alerts = useAllAlerts()
  const insights = useInsights()
  const [kind, setKind] = useState<Kind>('submission')
  const [state, setState] = useState('')
  const org = useApp((s) => s.account?.org ?? 'AICTE')
  const [err, setErr] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [api, setApi] = useState(false)

  const states = useMemo(() => withStats(insights.states).filter((s) => s.institutions > 0), [insights.states])

  async function generate() {
    setBusy(true)
    setApi(false)
    setErr('')
    if (SERVER_KINDS.includes(kind)) {
      try {
        const r = await http.get<{ title: string; header: string[]; rows: (string | number)[][]; notes: string[] }>(`/aicte/reports/${kind}${state ? `?state=${state}` : ''}`)
        setReport({ kind, ...r, hash: await sha256(JSON.stringify(r.rows)), generatedAt: new Date().toISOString() })
      } catch (e) {
        setErr((e as Error).message)
      }
      setBusy(false)
      return
    }
    const pick = (s: StateRow) => !state || s.code === state
    let r: Omit<Report, 'hash' | 'generatedAt'>
    if (kind === 'submission') {
      const list = states.filter(pick).sort((a, b) => b.institutions - a.institutions)
      r = {
        kind, title: `State-wise submission of enrolment returns, AY ${AY}`,
        header: ['State', 'Institutions', 'Submitted', 'Submitted %', 'Pending'],
        rows: list.map((s) => [s.name, s.institutions, s.submitted, Math.round((s.submitted / s.institutions) * 1000) / 10, s.institutions - s.submitted]),
        chart: list.slice(0, 12).map((s) => ({ label: s.name, value: Math.round((s.submitted / s.institutions) * 1000) / 10, max: 100, unit: '%' })),
      }
    } else if (kind === 'apaar') {
      const list = states.filter(pick).sort((a, b) => a.apaarPct - b.apaarPct)
      r = {
        kind, title: `APAAR coverage of submitted records by state, AY ${AY}`,
        header: ['State', 'Institutions submitted', 'APAAR-linked %', 'Without APAAR %'],
        rows: list.map((s) => [s.name, s.submitted, s.apaarPct, Math.round((100 - s.apaarPct) * 10) / 10]),
        chart: list.slice(0, 12).map((s) => ({ label: s.name, value: s.apaarPct, max: 100, unit: '%' })),
      }
    } else {
      const list = alerts.filter((a) => a.rule === 'R06' && (!state || a.state === state))
      r = {
        kind, title: `Excess-admission register, AY ${AY}`,
        header: ['Institution', 'City', 'State', 'Finding', 'Detected', 'Clause'],
        rows: list.map((a) => [a.institution, a.city, a.state, a.title, formatDate(a.detected), 'APH 2024-27, cl. 7.4(g)']),
      }
    }
    const hash = await sha256(JSON.stringify(r.rows))
    setReport({ ...r, hash, generatedAt: new Date().toISOString() })
    audit('Reports', 'Generated report', `${r.title}, SHA-256 ${hash.slice(0, 16)}`)
    setBusy(false)
  }

  function exportExcel() {
    if (!report) return
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([[report.title], [`Generated ${formatDate(report.generatedAt)}, SHA-256 ${report.hash}`], [], report.header, ...report.rows])
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    audit('Reports', 'Exported report (Excel)', report.title)
    XLSX.writeFile(wb, `${report.title.replace(/[^A-Za-z0-9]+/g, '_')}.xlsx`)
  }

  return (
    <AicteLayout>
      <PageTitle title="Reports" sub="For policy, accreditation and monitoring. Every report records the hash of the data it was built from." />

      <Panel title="Build a report" className="no-print">
        <div className="grid gap-4 md:grid-cols-[3fr_1fr_auto] md:items-end">
          <label className="text-sm text-muted">Report
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={`${select} mt-1`}>
              {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
          <label className="text-sm text-muted">State
            <select value={state} onChange={(e) => setState(e.target.value)} className={`${select} mt-1`}>
              <option value="">All states</option>
              {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </label>
          <button className={btn.primary} onClick={generate} disabled={busy}>
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
            {busy ? 'Generating' : 'Generate report'}
          </button>
        </div>
      </Panel>

      {err && <p role="alert" className="mt-4 rounded border-l-4 border-err bg-err-bg px-4 py-2 text-sm text-err">{err}</p>}
      {!report && !busy && (
        <div className="mt-6 rounded border border-dashed border-line bg-white px-6 py-12 text-center text-muted">
          Choose a report and select Generate report to preview it here.
        </div>
      )}

      {report && (
        <Panel className="mt-6" title={report.title}
          actions={<div className="no-print flex flex-wrap gap-2">
            <button className={btn.secondary} onClick={() => { audit('Reports', 'Exported report (PDF)', report.title); window.print() }}>Export PDF</button>
            <button className={btn.secondary} onClick={exportExcel}>Export Excel</button>
            <button className={btn.secondary} onClick={() => setApi((v) => !v)}>API</button>
          </div>}>
          <p className="text-sm text-muted">Generated {formatDate(report.generatedAt)} by {org}.</p>
          <p className="mt-1 break-all font-mono text-xs text-muted">SHA-256 {report.hash}</p>
          {report.kind === 'excess' && <p className="mt-2 text-sm"><Clause clause="7.4(g)" /></p>}

          {api && (
            <pre className="no-print mt-4 overflow-x-auto rounded bg-ink p-4 text-[0.8125rem] text-white">{`${SERVER_KINDS.includes(report.kind) ? `GET /api/aicte/reports/${report.kind}${state ? `?state=${state}` : ''}\nCookie: session of a signed-in AICTE officer` : 'Built in the browser from GET /api/aicte/insights and /api/aicte/alerts'}\n\n→ 200 OK  application/json  (${report.rows.length} rows, sha256 ${report.hash.slice(0, 12)}…)`}</pre>
          )}

          {report.notes && report.notes.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          )}
          {report.chart && <BarChart data={report.chart} />}

          <div className="mt-6 overflow-x-auto rounded border border-line">
            <table className="w-full text-[0.9375rem]">
              <thead className="border-b border-line bg-page/60"><tr>{report.header.map((h, i) => <th key={h} className={`${th} ${i > 0 && typeof report.rows[0]?.[i] === 'number' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {report.rows.map((r, i) => (
                  <tr key={i}>{r.map((c, j) => <td key={j} className={`${td} py-2.5 ${typeof c === 'number' ? 'text-right tnum' : ''}`}>{typeof c === 'number' ? c.toLocaleString('en-IN') : c}</td>)}</tr>
                ))}
                {!report.rows.length && <tr><td colSpan={report.header.length} className="px-4 py-8 text-center text-muted">No records for this selection.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </AicteLayout>
  )
}

function BarChart({ data }: { data: { label: string; value: number; max: number; unit: string }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  return (
    <div className="mt-6" role="img" aria-label="Bar chart of the report values">
      <ul className="space-y-2">
        {data.map((d, i) => (
          <li key={d.label} className="grid grid-cols-[180px_1fr_56px] items-center gap-3 text-sm"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="truncate text-ink" title={d.label}>{d.label}</span>
            <span className="relative h-5 rounded-r bg-page">
              <span className={`absolute inset-y-0 left-0 origin-left animate-[growX_.6s_ease-out_both] rounded-r ${hover === null || hover === i ? 'bg-navy' : 'bg-[#9A9A9A]'}`}
                style={{ width: `${(d.value / d.max) * 100}%`, animationDelay: `${i * 40}ms` }} />
            </span>
            <span className="text-right font-semibold tnum">{d.value}{d.unit}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
