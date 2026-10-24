import { useEffect, useMemo, useState } from 'react'
import { AicteLayout, RULE_NAME } from '../ui/AicteLayout'
import { Clause, LockIcon, PageTitle, Panel, btn, formatDate, maskApaar, td, th } from '../../inst/ui/bits'
import { STATE_NAME, type AicteAlert } from '../data'
import { statusOf, useAllAlerts, useCases, type CaseStatus } from '../store'
import { useApp } from '../../store'

const select = 'h-10 rounded border border-line bg-white px-3 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-navy/30'

export default function Alerts() {
  const alerts = useAllAlerts()
  const actions = useCases((s) => s.actions)
  const [state, setState] = useState('')
  const [rule, setRule] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const states = useMemo(() => [...new Set(alerts.map((a) => a.state))].sort(), [alerts])
  const shown = alerts.filter((a) =>
    (!state || a.state === state) &&
    (!rule || a.rule === rule) &&
    (!status || statusOf(actions, a.id) === status) &&
    (!q || a.institution.toLowerCase().includes(q.toLowerCase())))
  const current = alerts.find((a) => a.id === open) ?? null

  return (
    <AicteLayout>
      <PageTitle title="Compliance alerts" sub="Raised by the validation rules when institutions submit. Every case is reviewed by an officer before any action." />

      <Panel flush>
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
          <label className="flex flex-col gap-1 text-sm text-muted">Institution
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className={`${select} w-56`} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">State
            <select value={state} onChange={(e) => setState(e.target.value)} className={select}>
              <option value="">All states</option>
              {states.map((s) => <option key={s} value={s}>{STATE_NAME[s] ?? s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">Alert type
            <select value={rule} onChange={(e) => setRule(e.target.value)} className={select}>
              <option value="">All types</option>
              {Object.entries(RULE_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={select}>
              <option value="">Any status</option>
              <option>Open</option>
              <option>Referred to Regional Office</option>
              <option>Reviewed, no action</option>
            </select>
          </label>
          <span className="ml-auto pb-2 text-sm text-muted">{shown.length} of {alerts.length} alerts</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead className="border-b border-line bg-page/60">
              <tr>
                <th className={th}>Detected</th>
                <th className={th}>Institution</th>
                <th className={th}>Alert</th>
                <th className={th}>Rule</th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((a) => (
                <tr key={a.id} className={a.live ? 'bg-warn-bg/60' : ''}>
                  <td className={`${td} whitespace-nowrap text-sm text-muted`}>{formatDate(a.detected)}</td>
                  <td className={td}>
                    <p className="font-semibold">{a.institution}</p>
                    <p className="text-sm text-muted">{a.city}, {STATE_NAME[a.state] ?? a.state}</p>
                  </td>
                  <td className={td}>
                    <p>{a.title}</p>
                    <p className="text-sm text-muted">{RULE_NAME[a.rule]}{a.live && <span className="ml-2 font-semibold text-warn">New submission</span>}</p>
                  </td>
                  <td className={`${td} text-sm`}>{a.clause ? <Clause clause={a.clause} /> : <span className="text-muted">Cross-institution check</span>}</td>
                  <td className={`${td} text-sm`}><StatusText s={statusOf(actions, a.id)} /></td>
                  <td className={`${td} text-right`}><button className={btn.link} onClick={() => setOpen(a.id)}>Review</button></td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">No alerts match these filters. Clear a filter to see more.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {current && <CaseDrawer a={current} onClose={() => setOpen(null)} />}
    </AicteLayout>
  )
}

export function StatusText({ s }: { s: CaseStatus }) {
  const tone = s === 'Open' ? 'text-warn font-semibold' : s === 'Referred to Regional Office' ? 'text-navy font-semibold' : 'text-muted'
  return <span className={tone}>{s}</span>
}

export function CaseDrawer({ a, onClose }: { a: AicteAlert; onClose: () => void }) {
  const account = useApp((s) => s.account)!
  const { actions, act } = useCases()
  const done = actions[a.id]
  const [note, setNote] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  function decide(status: CaseStatus) {
    act(a.id, { status, at: new Date().toISOString(), by: account.name, note: note.trim() })
    setToast(status === 'Referred to Regional Office'
      ? 'Referred to the Western Regional Office. Officer approval is required before any penalty.'
      : 'Closed with no action. The decision is logged.')
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={a.institution}>
      <button className="absolute inset-0 bg-ink/30" onClick={onClose} aria-label="Close" />
      <div className="relative flex h-full w-full max-w-xl animate-[slideIn_.25s_ease-out] flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <p className="text-sm text-muted">{RULE_NAME[a.rule]}</p>
            <h2 className="font-serif text-2xl font-medium text-ink">{a.institution}</h2>
            <p className="text-sm text-muted">{a.city}, {STATE_NAME[a.state] ?? a.state}, PID {a.pid}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-2xl leading-none text-muted hover:text-ink" aria-label="Close">×</button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section>
            <p className="text-lg font-semibold text-ink">{a.title}</p>
            <p className="text-muted">{a.detail}</p>
            {a.clause && <p className="mt-2"><Clause clause={a.clause} /></p>}
            {a.risk && <p className="mt-2 text-sm text-ink">Institution risk score <strong>{a.risk}/100</strong></p>}
          </section>

          {a.live && (
            <section className="rounded border border-line">
              <h3 className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">Submission</h3>
              <dl className="grid gap-x-6 gap-y-3 px-4 py-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Receipt number</dt><dd className="font-mono">{a.receiptNo}</dd></div>
                <div><dt className="text-muted">Submitted</dt><dd>{formatDate(a.detected)}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted">SHA-256</dt><dd className="break-all font-mono text-xs">{a.hash}</dd></div>
              </dl>
            </section>
          )}

          {a.rows && a.rows.length > 0 && (
            <section className="rounded border border-line">
              <h3 className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">Students in this alert</h3>
              <table className="w-full text-sm">
                <thead className="bg-page/60"><tr><th className={th}>Row</th><th className={th}>Student</th><th className={th}>APAAR</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {a.rows.map((r) => (
                    <tr key={r.rowNo}>
                      <td className="px-4 py-2 tnum text-muted">{r.rowNo}</td>
                      <td className="px-4 py-2"><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.studentId}, {r.programme}</p></td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono">{maskApaar(r.apaar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-ink">Officer decision</h3>
            {done ? (
              <div className="mt-2 border-l-4 border-navy bg-navy-light px-4 py-3 text-sm">
                <p className="font-semibold text-ink">{done.status}</p>
                <p className="text-muted">{done.by}, {formatDate(done.at)}</p>
                {done.note && <p className="mt-1 text-ink">{done.note}</p>}
              </div>
            ) : (
              <>
                <label className="mt-2 block text-sm text-muted" htmlFor="note">Note for the case file</label>
                <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                  className="mt-1 w-full rounded border border-line px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-navy/30"
                  placeholder="Reason for referral or closure" />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button className={btn.primary} onClick={() => decide('Referred to Regional Office')}>Refer to Regional Office</button>
                  <button className={btn.secondary} onClick={() => decide('Reviewed, no action')}>Close, no action</button>
                </div>
                <p className="mt-3 flex items-center gap-2 text-sm text-muted"><LockIcon /> No penalty is applied automatically. Every decision is logged with your name.</p>
              </>
            )}
            {toast && <p role="status" className="mt-3 border-l-4 border-ok bg-ok-bg px-4 py-3 text-sm text-ink">{toast}</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
