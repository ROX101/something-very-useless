import { useState } from 'react'
import { Link } from 'react-router-dom'
import { InstLayout } from '../ui/InstLayout'
import { Card, ClauseChip, LockIcon, PageHeader, btn, formatDate } from '../ui/bits'
import { useInst, useValidation, type Submission } from '../store'
import { INSTITUTION } from '../data/reference'
import { useApp } from '../../store'

export default function Submit() {
  const account = useApp((s) => s.account)!
  const { rows, fileName, submissions, submit: submitToAicte } = useInst()
  const result = useValidation()
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [revising, setRevising] = useState(false)
  const isNodal = account.role === 'inst_admin'
  const latest = submissions[0]

  if (latest && !revising) {
    return (
      <InstLayout>
        <PageHeader title="Submission receipt" sub={`AY ${INSTITUTION.ay}, enrolment data`}
          actions={<>
            <button className={btn.secondary} onClick={() => window.print()}>Print receipt</button>
            {isNodal && <button className={`${btn.secondary} no-print`} onClick={() => setRevising(true)}>Submit revised data</button>}
          </>} />
        <Receipt s={latest} />
        {submissions.length > 0 && <History items={submissions} />}
      </InstLayout>
    )
  }

  if (!result || !rows) {
    return (
      <InstLayout>
        <PageHeader title="Submit to AICTE" sub={`AY ${INSTITUTION.ay}, enrolment data`} />
        <Card className="p-10 text-center">
          <p className="text-lg font-semibold text-ink">Nothing to submit yet</p>
          <p className="mt-1 text-sm text-muted">Upload and validate the admissions file first.</p>
          <Link to="/inst/upload" className={`${btn.primary} mt-5`}>Upload admissions</Link>
        </Card>
      </InstLayout>
    )
  }

  const blocked = result.dataErrors > 0

  async function submit() {
    if (!result || !rows) return
    setBusy(true)
    setSubmitErr('')
    try {
      await submitToAicte()
      setAgree(false)
      setRevising(false)
    } catch (e) {
      setSubmitErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <InstLayout>
      <PageHeader title="Submit to AICTE" sub={<>AY {INSTITUTION.ay}, due before 30 November <ClauseChip clause="2.25(n)" /></>} />

      <Card className="p-6">
        <h2 className="font-semibold text-ink">Summary</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-4">
          <Item label="Records" value={result.counts.total.toLocaleString('en-IN')} />
          <Item label="Clean" value={result.counts.clean.toLocaleString('en-IN')} />
          <Item label="Auto-cleared" value={String(result.counts.auto)} />
          <Item label="Compliance alerts" value={String(result.alerts.length)} tone={result.alerts.length ? 'text-warn' : undefined} />
        </dl>
        <p className="mt-4 text-sm text-muted">Source file: {fileName}</p>
      </Card>

      {blocked && (
        <div role="alert" className="mt-5 flex flex-col gap-3 rounded border-l-4 border-err bg-err-bg p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-err"><span className="font-semibold">{result.dataErrors} data errors</span> must be resolved before submission.</p>
          <Link to="/inst/upload" className={btn.primary}>Resolve errors</Link>
        </div>
      )}

      {result.alerts.length > 0 && (
        <Card className="mt-5 border-warn-line p-6">
          <h2 className="flex items-center gap-2 font-semibold text-warn"><LockIcon /> Shared with AICTE on submission</h2>
          <ul className="mt-3 space-y-2">
            {result.alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-warn-bg px-3 py-2 text-sm">
                <span className="text-ink">{a.title}</span>
                <ClauseChip clause={a.clause} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-5 p-6">
        <h2 className="font-semibold text-ink">Declaration</h2>
        {isNodal ? (
          <>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded border border-line p-4 text-sm leading-relaxed text-ink">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} disabled={blocked}
                className="mt-1 h-4 w-4 accent-navy" />
              <span>
                I, <strong>{account.name}</strong>, nodal officer of {INSTITUTION.name}, {INSTITUTION.city} (PID {INSTITUTION.pid}),
                certify that the student data submitted for AY {INSTITUTION.ay} is complete and correct, as required by the
                institution’s affidavit under the AICTE Approval Process Handbook 2024-27.
              </span>
            </label>
            <button className={`${btn.primary} mt-5 w-full sm:w-auto`} disabled={!agree || blocked || busy} onClick={submit}>
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
              {busy ? 'Submitting…' : `Submit ${result.counts.total.toLocaleString('en-IN')} records to AICTE`}
            </button>
            {submitErr && <p role="alert" className="mt-3 text-sm text-err">{submitErr}</p>}
          </>
        ) : (
          <p className="mt-3 flex items-center gap-2 rounded bg-page px-4 py-3 text-sm text-ink">
            <LockIcon /> Only the institution’s nodal officer can sign the declaration and submit.
          </p>
        )}
      </Card>
    </InstLayout>
  )
}

function Item({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-semibold tabular-nums ${tone ?? 'text-ink'}`}>{value}</dd>
    </div>
  )
}

function Receipt({ s }: { s: Submission }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-4 border-b border-line border-l-4 border-l-ok bg-ok-bg px-6 py-5">
        <svg className="h-9 w-9 shrink-0 text-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>
        <div>
          <p className="text-xl font-semibold text-ink">Submitted to AICTE</p>
          <p className="text-sm text-muted">{INSTITUTION.name}, {INSTITUTION.city}, PID {INSTITUTION.pid}</p>
        </div>
      </div>
      <dl className="grid gap-x-8 gap-y-5 px-6 py-6 sm:grid-cols-2">
        <Row label="Receipt number" value={s.receiptNo} mono />
        <Row label="Submitted on" value={`${formatDate(s.submittedAt)} IST`} />
        <Row label="Records accepted" value={s.records.toLocaleString('en-IN')} />
        <Row label="Compliance alerts shared with AICTE" value={String(s.alerts)} />
        <Row label="Submitted by" value={s.submittedBy} />
        <Row label="Source file" value={s.fileName} />
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted">SHA-256 of submitted data</dt>
          <dd className="mt-1 break-all rounded bg-page px-3 py-2 font-mono text-xs text-ink">{s.hash}</dd>
        </div>
      </dl>
    </Card>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 font-medium text-ink ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function History({ items }: { items: Submission[] }) {
  return (
    <Card className="no-print mt-6">
      <h2 className="border-b border-line px-6 py-4 font-semibold text-ink">Submission history</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-page text-left text-xs text-muted">
            <tr><th className="px-6 py-2">Receipt</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Records</th><th className="px-3 py-2">Alerts</th><th className="px-6 py-2">Hash</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((s, i) => (
              <tr key={s.receiptNo}>
                <td className="px-6 py-3 font-mono">{s.receiptNo}{i === 0 && <span className="ml-2 font-sans text-xs font-semibold text-ok">Current</span>}</td>
                <td className="px-3 py-3">{formatDate(s.submittedAt)}</td>
                <td className="px-3 py-3">{s.records}</td>
                <td className="px-3 py-3">{s.alerts}</td>
                <td className="px-6 py-3 font-mono text-xs text-muted">{s.hash.slice(0, 4)}…{s.hash.slice(-4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
