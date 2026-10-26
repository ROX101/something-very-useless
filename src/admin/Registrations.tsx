import { useEffect, useState } from 'react'
import { PortalShell } from '../ui/PortalShell'
import { PageTitle, Panel, btn, formatApaar, formatDate, td, th } from '../inst/ui/bits'
import { ADMIN_NAV } from '../aicte/pages/AuditTrail'
import { api } from '../api'

interface Reg {
  ref: string; kind: 'student' | 'org'; status: 'Received' | 'Approved' | 'Rejected'; createdAt: string
  apaar?: string; mobile?: string; org?: string; email?: string; purpose?: string
  decidedAt?: string; decidedBy?: string; decisionNote?: string; userId?: string
}

/** Sign-up requests from students and verifier organisations, approved into accounts with a one-time password. */
export default function Registrations() {
  const [list, setList] = useState<Reg[]>([])
  const [err, setErr] = useState('')
  const [issued, setIssued] = useState<{ ref: string; userId: string; password: string } | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const load = () => api.get<Reg[]>('/aicte/registrations').then(setList).catch((e: Error) => setErr(e.message))
  useEffect(() => { void load() }, [])

  async function decide(r: Reg, decision: 'Approved' | 'Rejected') {
    setErr(''); setIssued(null)
    try {
      const out = await api.post<{ registration: Reg; tempPassword?: string }>(`/aicte/registrations/${r.ref}/decide`, { decision, note: decision === 'Rejected' ? note : '' })
      if (out.tempPassword) setIssued({ ref: r.ref, userId: out.registration.userId!, password: out.tempPassword })
      setRejecting(null); setNote('')
      void load()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const waiting = list.filter((r) => r.status === 'Received').length
  return (
    <PortalShell context="Platform administration" nav={ADMIN_NAV}>
      <PageTitle title="Registrations" sub={`${waiting} waiting for a decision`} />
      {err && <p role="alert" className="mb-4 rounded border-l-4 border-err bg-err-bg px-4 py-2 text-sm text-err">{err}</p>}
      {issued && (
        <div role="status" className="mb-4 rounded border-l-4 border-ok bg-ok-bg px-4 py-3 text-sm">
          <p className="font-semibold">Account {issued.userId} created ({issued.ref}).</p>
          <p className="mt-1">One-time password: <code className="rounded bg-white px-2 py-0.5 font-mono text-base">{issued.password}</code></p>
          <p className="mt-1 text-muted">It is shown only now. In production it goes to the applicant by SMS or email; they must change it at first sign-in.</p>
        </div>
      )}
      <Panel flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[0.9375rem]">
            <thead className="border-b border-line bg-page/60"><tr><th className={th}>Request</th><th className={th}>Applicant</th><th className={th}>Status</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-line">
              {!list.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No registration requests yet.</td></tr>}
              {list.map((r) => (
                <tr key={r.ref}>
                  <td className={td}><p className="font-mono text-sm font-semibold">{r.ref}</p><p className="text-sm text-muted">{r.kind === 'student' ? 'Student' : 'Verifier organisation'}, {formatDate(r.createdAt)}</p></td>
                  <td className={td}>
                    {r.kind === 'student'
                      ? <><p className="font-mono">{formatApaar(r.apaar!)}</p><p className="text-sm text-muted">{r.mobile}</p></>
                      : <><p>{r.org}</p><p className="text-sm text-muted">{r.email}{r.purpose ? `, ${r.purpose}` : ''}</p></>}
                  </td>
                  <td className={td}>
                    <span className={r.status === 'Approved' ? 'font-semibold text-ok' : r.status === 'Rejected' ? 'font-semibold text-err' : 'font-semibold'}>{r.status === 'Received' ? 'Waiting' : r.status}</span>
                    {r.decidedAt && <p className="text-xs text-muted">{formatDate(r.decidedAt)} by {r.decidedBy}{r.decisionNote ? `: ${r.decisionNote}` : ''}</p>}
                  </td>
                  <td className={`${td} text-right`}>
                    {r.status === 'Received' && (rejecting === r.ref ? (
                      <div className="flex flex-col items-end gap-2">
                        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason, sent to the applicant" className="h-9 w-64 rounded border border-line px-3 text-sm" />
                        <div className="flex gap-2"><button className={btn.secondary} onClick={() => setRejecting(null)}>Cancel</button><button className={btn.primary} disabled={note.trim().length < 3} onClick={() => void decide(r, 'Rejected')}>Reject</button></div>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button className={btn.secondary} onClick={() => { setRejecting(r.ref); setNote('') }}>Reject</button>
                        <button className={btn.primary} onClick={() => void decide(r, 'Approved')}>Approve</button>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-sm text-muted">Student requests are approved only when the APAAR ID is in the registry. Verifier accounts can see a student’s degree only after that student consents.</p>
      </Panel>
    </PortalShell>
  )
}
