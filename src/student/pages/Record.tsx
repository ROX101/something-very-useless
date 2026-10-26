import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { StudentLayout } from '../StudentLayout'
import { Notice, PageTitle, Panel, btn, formatApaar, formatDate, td, th } from '../../inst/ui/bits'
import { useConsent } from '../../verify/consent'
import { QrCode } from '../../verify/QrCode'
import { api } from '../../api'

interface Record {
  apaar: string
  name: string
  credentials: { certNo: string; issuedAt: string; revoked: boolean; degree: string | null; year: number | null; studentId: string | null }[]
  enrolments: { ay: string; institution: string; city: string; programme: string | null; status: string; statusDate: string | null; receipt: string | null }[]
}

export default function Record() {
  const pending = useConsent((s) => s.requests.filter((r) => r.status === 'Pending'))
  const [rec, setRec] = useState<Record | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.get<Record>('/student/record').then(setRec).catch((e: Error) => setErr(e.message)) }, [])

  return (
    <StudentLayout>
      <PageTitle title="My record" sub="Your APAAR-linked enrolment and credentials" />
      <div className="space-y-6">
        {pending.map((r) => (
          <Notice key={r.id} tone="warn" action={<Link to="/student/requests" className={btn.primary}>Review request</Link>}>
            <strong>{r.verifierOrg}</strong> requests to verify your degree.
          </Notice>
        ))}
        {err && <p role="alert" className="text-err">{err}</p>}

        <Panel title="Student" flush>
          <dl className="grid gap-x-8 gap-y-4 px-5 py-4 text-[0.9375rem] sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-sm text-muted">Name</dt><dd className="mt-0.5 font-semibold">{rec?.name ?? '…'}</dd></div>
            <div><dt className="text-sm text-muted">APAAR ID</dt><dd className="mt-0.5 font-mono">{rec ? formatApaar(rec.apaar) : '…'}</dd></div>
            <div><dt className="text-sm text-muted">University student ID</dt><dd className="mt-0.5">{rec?.credentials[0]?.studentId ?? 'Not issued yet'}</dd></div>
          </dl>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="Enrolment returns that include you" className="min-w-0" flush>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.9375rem]">
                <thead className="border-b border-line bg-page/60">
                  <tr><th className={th}>Academic year</th><th className={th}>Institution</th><th className={th}>Programme</th><th className={th}>Status</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rec && !rec.enrolments.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No enrolment return on APAAR-Sathi includes your APAAR ID yet.</td></tr>}
                  {rec?.enrolments.map((h) => (
                    <tr key={`${h.ay}-${h.institution}`}>
                      <td className={`${td} tnum`}>{h.ay}</td>
                      <td className={td}>{h.institution}<p className="text-sm text-muted">{h.city}{h.receipt ? `, receipt ${h.receipt}` : ''}</p></td>
                      <td className={td}>{h.programme}</td>
                      <td className={td}>{h.status === 'active' ? 'Enrolled' : h.status === 'withdrawn' ? `Withdrawn${h.statusDate ? ` ${h.statusDate}` : ''}` : h.status === 'transferred' ? `Transferred${h.statusDate ? ` ${h.statusDate}` : ''}` : h.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-3 text-sm text-muted">If something is missing or wrong, ask your institution’s nodal officer to correct its enrolment return.</p>
          </Panel>

          <Panel title="Degree certificates" className="min-w-0">
            {rec && !rec.credentials.length && <p className="text-muted">No certificate has been issued to your APAAR ID yet.</p>}
            <div className="space-y-6">
              {rec?.credentials.map((c) => (
                <div key={c.certNo} className="flex flex-col gap-5 sm:flex-row lg:flex-col xl:flex-row">
                  <div className="self-start rounded border border-line p-2"><QrCode value={`${window.location.origin}/c/${c.certNo}`} size={140} label={`QR code for certificate ${c.certNo}`} /></div>
                  <div className="text-[0.9375rem]">
                    <p className="font-semibold">{c.degree}</p>
                    <p className="text-muted">{c.year}, certificate {c.certNo}</p>
                    <p className={`mt-3 font-semibold ${c.revoked ? 'text-err' : 'text-ok'}`}>{c.revoked ? 'Revoked by the university' : 'Valid, signed by the university'}</p>
                    <p className="text-sm text-muted">Issued {formatDate(c.issuedAt)}</p>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                      <Link to={`/certificate/${c.certNo}`} target="_blank" className={btn.link}>Open printable certificate</Link>
                      <Link to={`/c/${c.certNo}`} target="_blank" className={btn.link}>What a scan shows</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted">Anyone who scans the QR sees your name, APAAR ID, degree and year. Your marks are shared only with organisations you allow.</p>
          </Panel>
        </div>
      </div>
    </StudentLayout>
  )
}
