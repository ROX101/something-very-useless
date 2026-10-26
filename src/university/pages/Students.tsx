import { useEffect, useMemo, useState } from 'react'
import { UniversityLayout } from '../UniversityLayout'
import { PageTitle, Panel, btn, formatApaar, td, th } from '../../inst/ui/bits'
import { api } from '../../api'

interface Student {
  apaar: string | null; instStudentId: string | null; name: string | null; dob: string | null; programme: string | null
  institution: string; institutionPid: string; ay: string; status: string; apaarStatus: string; printable: boolean
}
interface Me { issuer: { name: string; short: string; kid: string } | null; institutions: { pid: string; name: string; city: string }[] }

const field = 'h-11 w-full rounded border border-line bg-white px-3 text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-navy/30'

export default function Students() {
  const [me, setMe] = useState<Me | null>(null)
  const [list, setList] = useState<Student[] | null>(null)
  const [q, setQ] = useState('')
  const [show, setShow] = useState<'all' | 'printable' | 'problems'>('all')
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get<Me>('/university/me').then(setMe).catch((e: Error) => setErr(e.message))
    api.get<Student[]>('/university/students').then(setList).catch((e: Error) => setErr(e.message))
  }, [])

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase().replace(/\s/g, '')
    return (list ?? []).filter((s) =>
      (show === 'all' || (show === 'printable' ? s.printable : !s.printable)) &&
      (!n || `${s.name ?? ''}${s.instStudentId ?? ''}${s.apaar ?? ''}`.toLowerCase().replace(/\s/g, '').includes(n)))
  }, [list, q, show])
  const printable = list?.filter((s) => s.printable).length ?? 0

  return (
    <UniversityLayout>
      <PageTitle title="Students and APAAR IDs" sub={me?.issuer ? `${me.issuer.name}, ${me.institutions.length} affiliated institution${me.institutions.length === 1 ? '' : 's'}` : 'Loading…'}
        actions={<a href="/api/university/students.csv" className={btn.primary}>Export {printable.toLocaleString('en-IN')} verified IDs for printing (.csv)</a>} />
      {err && <p role="alert" className="mb-4 text-err">{err}</p>}

      <p className="mb-5 max-w-3xl text-[0.9375rem] text-muted">
        These come from the enrolment returns your affiliated institutions submitted to AICTE. An APAAR ID is ready to print next to your
        student ID on certificates and marksheets only when it matches the national APAAR registry (name and date of birth) and the student is still enrolled.
        Never print Aadhaar numbers on certificates (UGC, 2023); the APAAR ID is the identifier to use.
      </p>

      <Panel flush title={<span>{rows.length.toLocaleString('en-IN')} students</span>}>
        <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-[2fr_1fr]">
          <label className="text-sm text-muted">Search name, student ID or APAAR ID
            <input value={q} onChange={(e) => setQ(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="text-sm text-muted">Show
            <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className={`${field} mt-1`}>
              <option value="all">All students</option>
              <option value="printable">Ready to print</option>
              <option value="problems">Needs attention</option>
            </select>
          </label>
        </div>
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full min-w-[760px] text-[0.9375rem]">
            <thead className="sticky top-0 border-b border-line bg-page"><tr>
              <th className={th}>Student</th><th className={th}>Institution student ID</th><th className={th}>APAAR ID</th><th className={th}>Programme</th><th className={th}>APAAR check</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {!list && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Loading…</td></tr>}
              {list && !rows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">{list.length ? 'No students match.' : 'No affiliated institution has submitted its enrolment return yet.'}</td></tr>}
              {rows.slice(0, 500).map((s, i) => (
                <tr key={`${s.institutionPid}-${s.instStudentId}-${i}`}>
                  <td className={td}><p className="font-medium">{s.name}</p><p className="text-sm text-muted">{s.institution}</p></td>
                  <td className={`${td} font-mono text-sm`}>{s.instStudentId}</td>
                  <td className={`${td} whitespace-nowrap font-mono text-sm`}>{s.apaar ? formatApaar(s.apaar) : '—'}</td>
                  <td className={td}>{s.programme}</td>
                  <td className={td}><span className={`text-sm font-semibold ${s.printable ? 'text-ok' : 'text-warn'}`}>{s.status !== 'active' ? `Not enrolled (${s.status})` : s.apaarStatus}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 500 && <p className="border-t border-line px-5 py-3 text-sm text-muted">Showing the first 500. Search to narrow down, or export the full list.</p>}
      </Panel>
    </UniversityLayout>
  )
}
