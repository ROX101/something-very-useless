import { useEffect, useState } from 'react'
import { STUDENT, StudentLayout } from '../StudentLayout'
import { PageTitle, Panel, btn, formatDate } from '../../inst/ui/bits'
import { PRIVATE_FIELDS, SHARED_FIELDS, useConsent, type VerificationRequest } from '../../verify/consent'

const MARKS = 'Marks and CGPA'
/** What this particular request would share, and what it would not. */
const sharedFor = (r: VerificationRequest) => (r.fields?.includes('marks') ? [...SHARED_FIELDS, 'Marks: CGPA and division'] : SHARED_FIELDS)
const privateFor = (r: VerificationRequest) => (r.fields?.includes('marks') ? PRIVATE_FIELDS.filter((f) => f !== MARKS) : PRIVATE_FIELDS)

export default function Requests() {
  const all = useConsent((s) => s.requests).filter((r) => r.apaar === STUDENT.apaar)
  const pending = all.filter((r) => r.status === 'Pending')
  const past = all.filter((r) => r.status !== 'Pending')
  const [otpFor, setOtpFor] = useState<VerificationRequest | null>(null)
  const [justApproved, setJustApproved] = useState<string | null>(null)
  const { decide, revoke } = useConsent()

  return (
    <StudentLayout>
      <PageTitle title="Verification requests" sub="Organisations must ask before they can see your degree details. You decide." />

      <div className="space-y-6">
        {pending.length === 0 && !justApproved && (
          <div className="rounded border border-dashed border-line bg-white px-6 py-10 text-center text-muted">No requests waiting for you.</div>
        )}

        {justApproved && (() => {
          const r = all.find((x) => x.id === justApproved)
          if (!r || r.status !== 'Approved') return null
          return (
            <section className="rounded border border-line bg-white">
              <div className="border-b border-line border-l-4 border-l-ok bg-ok-bg px-5 py-4">
                <p className="text-lg font-semibold text-ink">Consent given to {r.verifierOrg}</p>
                <p className="text-muted">They can see only the fields you allowed, until the date below.</p>
              </div>
              <dl className="grid gap-x-8 gap-y-3 px-5 py-4 text-[0.9375rem] sm:grid-cols-3">
                <div><dt className="text-sm text-muted">Consent number</dt><dd className="font-mono">{r.consentNo}</dd></div>
                <div><dt className="text-sm text-muted">Valid until</dt><dd>{formatDate(r.expiresAt!)}</dd></div>
                <div><dt className="text-sm text-muted">Shared</dt><dd>{sharedFor(r).join(', ')}</dd></div>
              </dl>
              <div className="border-t border-line px-5 py-3">
                <button className={btn.secondary} onClick={() => { revoke(r.id); setJustApproved(null) }}>Revoke consent</button>
              </div>
            </section>
          )
        })()}

        {pending.map((r) => (
          <section key={r.id} className="rounded border border-line bg-white">
            <div className="border-b border-line px-5 py-4">
              <p className="text-sm text-muted">Request received {formatDate(r.createdAt)}</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">{r.verifierOrg} wants to verify your degree</h2>
              <p className="text-muted">Requested by {r.verifier}, registered verifier</p>
            </div>
            <dl className="grid gap-x-8 gap-y-3 px-5 py-4 text-[0.9375rem] sm:grid-cols-2">
              <div><dt className="text-sm text-muted">Purpose</dt><dd className="font-medium">{r.purpose}</dd></div>
              {r.reference && <div><dt className="text-sm text-muted">Reference</dt><dd className="font-medium">{r.reference}</dd></div>}
              <div><dt className="text-sm text-muted">Access for</dt><dd className="font-medium">{r.validityDays} days after you allow</dd></div>
              <div><dt className="text-sm text-muted">Data kept by {r.verifierOrg.replace(' Pvt. Ltd.', '')}</dt><dd className="font-medium">{r.retentionDays ?? 30} days, then deleted</dd></div>
            </dl>
            <div className="grid gap-4 border-t border-line px-5 py-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-ink">Will be shared</p>
                <ul className="mt-2 space-y-1.5">
                  {sharedFor(r).map((f) => <li key={f} className="flex items-center gap-2"><Mark ok />{f}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Will not be shared</p>
                <ul className="mt-2 space-y-1.5">
                  {privateFor(r).map((f) => <li key={f} className="flex items-center gap-2 text-muted"><Mark />{f}</li>)}
                </ul>
              </div>
            </div>
            <div className="border-t border-line px-5 py-4">
              <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                <button className={btn.primary} onClick={() => setOtpFor(r)}>Allow</button>
                <button className={btn.secondary} onClick={() => decide(r.id, 'Refused')}>Refuse</button>
              </div>
            </div>
            <p className="border-t border-line px-5 py-3 text-sm text-muted">Consent under the Digital Personal Data Protection Act, 2023. Refusing has no effect on your records.</p>
          </section>
        ))}

        {past.length > 0 && (
          <Panel title="Earlier requests" flush>
            <ul className="divide-y divide-line">
              {past.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="font-medium">{r.verifierOrg}</p>
                    <p className="text-sm text-muted">{r.purpose}{r.reference && `, ${r.reference}`}</p>
                    <p className="text-sm text-muted">{formatDate(r.createdAt)}{r.consentNo && `, ${r.consentNo}`}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-semibold ${r.status === 'Approved' ? 'text-ok' : 'text-muted'}`}>{r.status}</span>
                    {r.status === 'Approved' && <button className={btn.link} onClick={() => revoke(r.id)}>Revoke</button>}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      {otpFor && (
        <OtpDialog
          onCancel={() => setOtpFor(null)}
          onConfirm={() => { decide(otpFor.id, 'Approved'); setJustApproved(otpFor.id); setOtpFor(null) }}
        />
      )}
    </StudentLayout>
  )
}

function Mark({ ok }: { ok?: boolean }) {
  return ok
    ? <svg className="h-4 w-4 shrink-0 text-ok" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" aria-label="shared"><path d="M3 8.5l3.2 3L13 4.5" /></svg>
    : <svg className="h-4 w-4 shrink-0 text-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-label="not shared"><path d="M4 4l8 8M12 4l-8 8" /></svg>
}

function OtpDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const code = '482913'
  const [typed, setTyped] = useState('')
  useEffect(() => {
    let i = 0
    const id = window.setInterval(() => {
      i++
      setTyped(code.slice(0, i))
      if (i >= code.length) window.clearInterval(id)
    }, 110)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Confirm with OTP">
      <button className="absolute inset-0 bg-ink/40" onClick={onCancel} aria-label="Cancel" />
      <div className="relative w-full max-w-sm rounded border border-line bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-ink">Confirm it’s you</h2>
        <p className="mt-1 text-muted">Enter the 6-digit code sent to {STUDENT.mobile}.</p>
        <div className="mt-4 flex gap-2" aria-label="One-time password">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={`flex h-12 w-10 items-center justify-center rounded border text-xl font-semibold tnum ${typed[i] ? 'border-navy' : 'border-line'}`}>{typed[i] ?? ''}</span>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">Code read from SMS</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button className={btn.primary} disabled={typed.length < 6} onClick={onConfirm}>Confirm</button>
          <button className={btn.secondary} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
