import { useState, type FormEvent } from 'react'
import { VERIFIER, VerifierLayout } from '../VerifierLayout'
import { PageTitle, Panel, btn, formatDate, maskApaar, td, th } from '../../inst/ui/bits'
import { PURPOSES, RETENTION, SHARED_FIELDS, useConsent } from '../../verify/consent'

const input = 'h-11 w-full rounded border border-line bg-white px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-navy/30'

export default function Requests() {
  const { requests, request } = useConsent()
  const mine = requests.filter((r) => r.verifierOrg === VERIFIER.org)
  const [apaar, setApaar] = useState('')
  const [purposeId, setPurposeId] = useState<string>(PURPOSES[0].id)
  const [reference, setReference] = useState('')
  const [days, setDays] = useState(7)
  const [keep, setKeep] = useState(RETENTION[0])
  const [err, setErr] = useState('')
  const [refErr, setRefErr] = useState('')
  const purpose = PURPOSES.find((p) => p.id === purposeId)!
  const [sent, setSent] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    const d = apaar.replace(/\s/g, '')
    const bad = !/^\d{12}$/.test(d)
    const noRef = reference.trim().length < 4
    setErr(bad ? 'Enter the student’s 12-digit APAAR ID.' : '')
    setRefErr(noRef ? `Enter the ${purpose.reference.toLowerCase()}.` : '')
    if (bad || noRef) return
    request({ apaar: d, verifier: VERIFIER.name, verifierOrg: VERIFIER.org, purpose: purpose.label, reference: `${purpose.reference.replace(' number', '')} ${reference.trim()}`, validityDays: days, retentionDays: keep })
    setApaar('')
    setReference('')
    setSent(true)
  }

  return (
    <VerifierLayout>
      <PageTitle title="Consent requests" sub="Ask a student to share their degree details with your organisation" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <Panel title="New request" className="min-w-0">
          <form onSubmit={submit} noValidate className="space-y-4">
            <label className="block text-sm text-muted">Student’s APAAR ID
              <input value={apaar} onChange={(e) => { setApaar(e.target.value); setSent(false) }} placeholder="12 digits" className={`${input} mt-1 font-mono`} aria-invalid={Boolean(err)} />
            </label>
            {err && <p className="text-sm text-err">{err}</p>}
            <label className="block text-sm text-muted">Purpose
              <select value={purposeId} onChange={(e) => { setPurposeId(e.target.value); setRefErr('') }} className={`${input} mt-1`}>
                {PURPOSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="block text-sm text-muted">{purpose.reference}
              <input value={reference} onChange={(e) => { setReference(e.target.value); setSent(false) }} placeholder={`For example ${purpose.example}`} className={`${input} mt-1 font-mono`} aria-invalid={Boolean(refErr)} />
            </label>
            {refErr && <p className="text-sm text-err">{refErr}</p>}
            <label className="block text-sm text-muted">Access needed for
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${input} mt-1`}>
                <option value={7}>7 days</option>
                <option value={15}>15 days</option>
                <option value={30}>30 days</option>
              </select>
            </label>
            <label className="block text-sm text-muted">We will keep the data for
              <select value={keep} onChange={(e) => setKeep(Number(e.target.value))} className={`${input} mt-1`}>
                {RETENTION.map((d) => <option key={d} value={d}>{d} days, then delete</option>)}
              </select>
            </label>
            <p className="text-sm text-muted">You will see: {SHARED_FIELDS.join(', ').toLowerCase()}. Marks, category, address and date of birth are never shared.</p>
            <button type="submit" className={btn.primary}>Send request</button>
            {sent && <p role="status" className="border-l-4 border-ok bg-ok-bg px-4 py-2 text-sm">Request sent. The student will see it in their account.</p>}
          </form>
        </Panel>

        <Panel title="Your requests" className="min-w-0" flush>
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead className="border-b border-line bg-page/60"><tr><th className={th}>Student</th><th className={th}>Purpose</th><th className={th}>Sent</th><th className={th}>Status</th></tr></thead>
              <tbody className="divide-y divide-line">
                {mine.map((r) => (
                  <tr key={r.id}>
                    <td className={`${td} whitespace-nowrap font-mono text-sm`}>{maskApaar(r.apaar)}</td>
                    <td className={td}>{r.purpose}{r.reference && <p className="text-sm text-muted">{r.reference}</p>}</td>
                    <td className={`${td} whitespace-nowrap text-sm text-muted`}>{formatDate(r.createdAt)}</td>
                    <td className={td}>
                      <span className={`font-semibold ${r.status === 'Approved' ? 'text-ok' : r.status === 'Pending' ? 'text-warn' : 'text-muted'}`}>{r.status}</span>
                      {r.consentNo && <p className="text-sm text-muted">{r.consentNo}</p>}
                    </td>
                  </tr>
                ))}
                {!mine.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No requests yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </VerifierLayout>
  )
}
