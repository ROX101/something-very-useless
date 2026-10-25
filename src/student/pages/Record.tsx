import { Link } from 'react-router-dom'
import { STUDENT, StudentLayout } from '../StudentLayout'
import { Notice, PageTitle, Panel, btn, formatApaar, td, th } from '../../inst/ui/bits'
import { useConsent } from '../../verify/consent'
import { QrCode } from '../../verify/QrCode'
import { GENUINE_JWS } from '../../verify/credentials'

const HISTORY = [
  { ay: '2022-23', year: 'First year', status: 'Enrolled', reported: '28 Nov 2022' },
  { ay: '2023-24', year: 'Second year', status: 'Enrolled', reported: '24 Nov 2023' },
  { ay: '2024-25', year: 'Third year', status: 'Enrolled', reported: '27 Nov 2024' },
  { ay: '2025-26', year: 'Final year', status: 'Completed', reported: '21 Nov 2025' },
]

export default function Record() {
  const pending = useConsent((s) => s.requests.filter((r) => r.apaar === STUDENT.apaar && r.status === 'Pending'))

  return (
    <StudentLayout>
      <PageTitle title="My record" sub="Your APAAR-linked enrolment and credentials" />
      <div className="space-y-6">
        {pending.map((r) => (
          <Notice key={r.id} tone="warn" action={<Link to="/student/requests" className={btn.primary}>Review request</Link>}>
            <strong>{r.verifierOrg}</strong> requests to verify your degree.
          </Notice>
        ))}

        <Panel title="Student" flush>
          <dl className="grid gap-x-8 gap-y-4 px-5 py-4 text-[0.9375rem] sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-sm text-muted">Name</dt><dd className="mt-0.5 font-semibold">{STUDENT.name}</dd></div>
            <div><dt className="text-sm text-muted">APAAR ID</dt><dd className="mt-0.5 font-mono">{formatApaar(STUDENT.apaar)}</dd></div>
            <div><dt className="text-sm text-muted">University enrolment number</dt><dd className="mt-0.5">{STUDENT.studentId}</dd></div>
            <div><dt className="text-sm text-muted">Registered mobile</dt><dd className="mt-0.5">{STUDENT.mobile}</dd></div>
          </dl>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel title={`Enrolment history, ${STUDENT.programme}`} className="min-w-0" flush>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.9375rem]">
                <thead className="border-b border-line bg-page/60">
                  <tr><th className={th}>Academic year</th><th className={th}>Year of study</th><th className={th}>Status</th><th className={th}>Reported to AICTE</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {HISTORY.map((h) => (
                    <tr key={h.ay}>
                      <td className={`${td} tnum`}>{h.ay}</td>
                      <td className={td}>{h.year}</td>
                      <td className={td}>{h.status}</td>
                      <td className={`${td} text-sm text-muted`}>{h.reported}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-3 text-sm text-muted">Reported by {STUDENT.university}. If a year is missing, ask your institution’s nodal officer to correct its enrolment return.</p>
          </Panel>

          <Panel title="Degree certificate" className="min-w-0">
            <div className="flex flex-col gap-5 sm:flex-row lg:flex-col xl:flex-row">
              <div className="rounded border border-line p-2"><QrCode value={GENUINE_JWS} size={150} label="Signed QR code of your degree" /></div>
              <div className="text-[0.9375rem]">
                <p className="font-semibold">Bachelor of Technology in Computer Science & Engineering</p>
                <p className="text-muted">{STUDENT.university}, 2026</p>
                <p className="mt-3 font-semibold text-ok">Valid, signed by the university</p>
                <p className="text-sm text-muted">Issued 15 Jul 2026</p>
                <a href="/certificate/GTU-2026-CSE-0417" target="_blank" rel="noreferrer" className={`${btn.link} mt-4 inline-block`}>Open printable certificate</a>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted">Employers can check this QR code. They see your details only after you allow their request.</p>
          </Panel>
        </div>
      </div>
    </StudentLayout>
  )
}
