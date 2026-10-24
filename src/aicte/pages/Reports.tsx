import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { AicteLayout } from '../ui/AicteLayout'
import { Clause, PageTitle, Panel, btn, formatDate, td, th } from '../../inst/ui/bits'
import { STATES, type StateRow } from '../states'
import { AY } from '../data'
import { useAllAlerts, useLiveSubmission } from '../store'
import { sha256 } from '../../inst/store'

type Kind = 'submission' | 'apaar' | 'excess'

const KINDS: { id: Kind; label: string }[] = [
  { id: 'submission', label: 'State-wise submission of enrolment returns' },
  { id: 'apaar', label: 'APAAR coverage by state' },
  { id: 'excess', label: 'Excess-admission register' },
]

const PROFILES = ['Standard', 'NIRF (Sanctioned intake, total actual student strength)', 'AISHE (DCF 2024-25 format)', 'NBA SAR (enrolment ratio)']

const select = 'h-10 w-full rounded border border-line bg-white px-3 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-navy/30'

interface Report {
  kind: Kind
  title: string
  profile: string
  generatedAt: string
  hash: string
  header: string[]
  rows: (string | number)[][]
  chart?: { label: string; value: number; max: number; unit: string }[]
}

export default function Reports() {
  const alerts = useAllAlerts()
  const live = useLiveSubmission()
  const [kind, setKind] = useState<Kind>('submission')
  const [state, setState] = useState('')
  const [profile, setProfile] = useState(PROFILES[0])
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [api, setApi] = useState(false)

  const states = useMemo(() => STATES.filter((s) => s.institutions > 0).map((s) => (s.code === 'MH' && live ? { ...s, submitted: s.submitted + 1 } : s)), [live])

  async function generate() {
    setBusy(true)
    setApi(false)
    const pick = (s: StateRow) => !state || s.code === state
    let r: Omit<Report, 'hash' | 'generatedAt'>
    if (kind === 'submission') {
      const list = states.filter(pick).sort((a, b) => b.institutions - a.institutions)
      r = {
        kind, profile, title: `State-wise submission of enrolment returns, AY ${AY}`,
        header: ['State', 'Institutions', 'Submitted', 'Submitted %', 'Pending'],
        rows: list.map((s) => [s.name, s.institutions, s.submitted, Math.round((s.submitted / s.institutions) * 1000) / 10, s.institutions - s.submitted]),
        chart: list.slice(0, 12).map((s) => ({ label: s.name, value: Math.round((s.submitted / s.institutions) * 1000) / 10, max: 100, unit: '%' })),
      }
    } else if (kind === 'apaar') {
      const list = states.filter(pick).sort((a, b) => a.apaarPct - b.apaarPct)
      r = {
        kind, profile, title: `APAAR coverage of submitted records by state, AY ${AY}`,
        header: ['State', 'Institutions submitted', 'APAAR-linked %', 'Without APAAR %'],
        rows: list.map((s) => [s.name, s.submitted, s.apaarPct, Math.round((100 - s.apaarPct) * 10) / 10]),
        chart: list.slice(0, 12).map((s) => ({ label: s.name, value: s.apaarPct, max: 100, unit: '%' })),
      }
    } else {
      const list = alerts.filter((a) => a.rule === 'R06' && (!state || a.state === state))
      r = {
        kind, profile, title: `Excess-admission register, AY ${AY}`,
        header: ['Institution', 'City', 'State', 'Finding', 'Detected', 'Clause'],
        rows: list.map((a) => [a.institution, a.city, a.state, a.title, formatDate(a.detected), 'APH 2024-27, cl. 7.4(g)']),
      }
    }
    const hash = await sha256(JSON.stringify(r.rows))
    await new Promise((res) => setTimeout(res, 500))
    setReport({ ...r, hash, generatedAt: new Date().toISOString() })
    setBusy(false)
  }

  function exportExcel() {
    if (!report) return
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([[report.title], [`Profile: ${report.profile}`], [`Generated ${formatDate(report.generatedAt)}, SHA-256 ${report.hash}`], [], report.header, ...report.rows])
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `${report.title.replace(/[^A-Za-z0-9]+/g, '_')}.xlsx`)
  }

  return (
    <AicteLayout>
      <PageTitle title="Reports" sub="For policy, accreditation and monitoring. Every report records the hash of the data it was built from." />

      <Panel title="Build a report" className="no-print">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr_2fr_auto] md:items-end">
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
          <label className="text-sm text-muted">Export profile
            <select value={profile} onChange={(e) => setProfile(e.target.value)} className={`${select} mt-1`}>
              {PROFILES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <button className={btn.primary} onClick={generate} disabled={busy}>
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
            {busy ? 'Generating' : 'Generate report'}
          </button>
        </div>
      </Panel>

      {!report && !busy && (
        <div className="mt-6 rounded border border-dashed border-line bg-white px-6 py-12 text-center text-muted">
          Choose a report and select Generate report to preview it here.
        </div>
      )}

      {report && (
        <Panel className="mt-6" title={report.title}
          actions={<div className="no-print flex flex-wrap gap-2">
            <button className={btn.secondary} onClick={() => window.print()}>Export PDF</button>
            <button className={btn.secondary} onClick={exportExcel}>Export Excel</button>
            <button className={btn.secondary} onClick={() => setApi((v) => !v)}>API</button>
          </div>}>
          <p className="text-sm text-muted">Generated {formatDate(report.generatedAt)} by AICTE Regulation Bureau. Profile: {report.profile}.</p>
          <p className="mt-1 break-all font-mono text-xs text-muted">SHA-256 {report.hash}</p>
          {report.kind === 'excess' && <p className="mt-2 text-sm"><Clause clause="7.4(g)" /></p>}

          {api && (
            <pre className="no-print mt-4 overflow-x-auto rounded bg-ink p-4 text-[13px] text-white">{`GET /v1/reports/${report.kind}?ay=${AY}${state ? `&state=${state}` : ''}&profile=${encodeURIComponent(report.profile.split(' ')[0].toLowerCase())}
Authorization: Bearer <AICTE service token>

→ 200 OK  application/json  (${report.rows.length} rows, sha256 ${report.hash.slice(0, 12)}…)`}</pre>
          )}

          {report.chart && <BarChart data={report.chart} />}

          <div className="mt-6 overflow-x-auto rounded border border-line">
            <table className="w-full text-[15px]">
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
              <span className={`absolute inset-y-0 left-0 origin-left animate-[growX_.6s_ease-out_both] rounded-r ${hover === null || hover === i ? 'bg-navy' : 'bg-[#8798C8]'}`}
                style={{ width: `${(d.value / d.max) * 100}%`, animationDelay: `${i * 40}ms` }} />
            </span>
            <span className="text-right font-semibold tnum">{d.value}{d.unit}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
