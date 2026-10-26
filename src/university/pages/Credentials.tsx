import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { UniversityLayout } from '../UniversityLayout'
import { PageTitle, Panel, btn, formatApaar, formatDate, td, th } from '../../inst/ui/bits'
import { api } from '../../api'

interface Cred { certNo: string; apaar: string; holderName: string; degree: string; year: number; issuedAt: string; revoked: boolean; revokedReason: string | null; statusIndex: number }
interface Me { institutions: { pid: string; name: string }[] }

const input = 'h-11 w-full rounded border border-line bg-white px-3 text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-navy/30'
const blank = { apaar: '', holderName: '', studentId: '', programmeCode: 'CSE', degree: 'B.Tech, Computer Science & Engineering', year: String(new Date().getFullYear()), cgpa: '', division: 'First Class', institutionPid: '' }

export default function Credentials() {
  const [list, setList] = useState<Cred[]>([])
  const [me, setMe] = useState<Me | null>(null)
  const [f, setF] = useState(blank)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [revoking, setRevoking] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const load = () => api.get<Cred[]>('/university/credentials').then(setList).catch((e: Error) => setErr(e.message))
  useEffect(() => { void load(); api.get<Me>('/university/me').then(setMe).catch(() => undefined) }, [])
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function issue(e: FormEvent) {
    e.preventDefault()
    setErr(''); setOk('')
    try {
      const r = await api.post<{ certNo: string }>('/university/credentials', { ...f, year: Number(f.year), institutionPid: f.institutionPid || undefined })
      setOk(r.certNo)
      setF(blank)
      void load()
    } catch (e2) {
      setErr((e2 as Error).message)
    }
  }

  async function revoke(certNo: string) {
    setErr('')
    try {
      await api.post(`/university/credentials/${certNo}/revoke`, { reason })
      setRevoking(null); setReason('')
      void load()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <UniversityLayout>
      <PageTitle title="Certificates" sub="Issue signed degree certificates linked to the student’s APAAR ID, and revoke them if needed" />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.5fr]">
        <Panel title="Issue a degree certificate" className="min-w-0">
          <form onSubmit={issue} className="grid gap-4 sm:grid-cols-2" noValidate>
            <label className="text-sm text-muted sm:col-span-2">APAAR ID<input value={f.apaar} onChange={set('apaar')} placeholder="12 digits" className={`${input} mt-1 font-mono`} /></label>
            <label className="text-sm text-muted sm:col-span-2">Name, as in the APAAR registry<input value={f.holderName} onChange={set('holderName')} className={`${input} mt-1`} /></label>
            <label className="text-sm text-muted">University student ID<input value={f.studentId} onChange={set('studentId')} placeholder="GTU/2022/CSE/0417" className={`${input} mt-1`} /></label>
            <label className="text-sm text-muted">Programme code<input value={f.programmeCode} onChange={set('programmeCode')} className={`${input} mt-1 font-mono`} /></label>
            <label className="text-sm text-muted sm:col-span-2">Degree<input value={f.degree} onChange={set('degree')} className={`${input} mt-1`} /></label>
            <label className="text-sm text-muted">Year of award<input value={f.year} onChange={set('year')} inputMode="numeric" className={`${input} mt-1`} /></label>
            <label className="text-sm text-muted">CGPA<input value={f.cgpa} onChange={set('cgpa')} inputMode="decimal" placeholder="8.42" className={`${input} mt-1`} /></label>
            <label className="text-sm text-muted">Division<input value={f.division} onChange={set('division')} className={`${input} mt-1`} /></label>
            <label className="text-sm text-muted">Institution
              <select value={f.institutionPid} onChange={set('institutionPid')} className={`${input} mt-1`}>
                <option value="">Not stated</option>
                {me?.institutions.map((i) => <option key={i.pid} value={i.pid}>{i.name}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button className={btn.primary}>Sign and issue</button>
              <p className="mt-2 text-sm text-muted">The name is checked against the APAAR registry. The certificate is signed with your university’s key and gets a QR link anyone can verify.</p>
            </div>
          </form>
          {err && <p role="alert" className="mt-3 rounded border-l-4 border-err bg-err-bg px-4 py-2 text-sm text-err">{err}</p>}
          {ok && <p role="status" className="mt-3 rounded border-l-4 border-ok bg-ok-bg px-4 py-2 text-sm">Issued <Link to={`/certificate/${ok}`} className="font-semibold underline">{ok}</Link>.</p>}
        </Panel>

        <Panel title={`Issued (${list.length})`} className="min-w-0" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[0.9375rem]">
              <thead className="border-b border-line bg-page/60"><tr><th className={th}>Certificate</th><th className={th}>Student</th><th className={th}>Status</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-line">
                {!list.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">Nothing issued yet.</td></tr>}
                {list.map((c) => (
                  <tr key={c.certNo}>
                    <td className={td}><Link to={`/certificate/${c.certNo}`} className="font-mono text-sm font-semibold text-navy underline">{c.certNo}</Link><p className="text-sm text-muted">{c.degree}, {c.year}</p></td>
                    <td className={td}><p>{c.holderName}</p><p className="font-mono text-sm text-muted">{formatApaar(c.apaar)}</p></td>
                    <td className={td}>
                      {c.revoked ? <><span className="font-semibold text-err">Revoked</span><p className="text-sm text-muted">{c.revokedReason}</p></> : <span className="font-semibold text-ok">Valid</span>}
                      <p className="text-xs text-muted">Issued {formatDate(c.issuedAt)}</p>
                    </td>
                    <td className={`${td} text-right`}>
                      {!c.revoked && (revoking === c.certNo ? (
                        <div className="flex flex-col items-end gap-2">
                          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className={`${input} h-9 w-56`} />
                          <div className="flex gap-2">
                            <button className={btn.secondary} onClick={() => setRevoking(null)}>Cancel</button>
                            <button className={btn.primary} disabled={reason.trim().length < 5} onClick={() => void revoke(c.certNo)}>Revoke</button>
                          </div>
                        </div>
                      ) : <button className={btn.secondary} onClick={() => { setRevoking(c.certNo); setReason('') }}>Revoke</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-3 text-sm text-muted">Revocation is published in your signed status list (W3C Bitstring Status List). Every verifier sees it on the next scan.</p>
        </Panel>
      </div>
    </UniversityLayout>
  )
}
