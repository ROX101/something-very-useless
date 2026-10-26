import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { PortalShell } from '../ui/PortalShell'
import { PageTitle, Panel, btn, formatApaar, formatDate, td, th } from '../inst/ui/bits'
import { api } from '../api'

interface Inst { pid: string; name: string; city: string; state: string }
interface Grant { id: string; institutionPid: string; institution?: string; city?: string; basis: string; reference: string; createdAt: string; expiresAt: string; active: boolean }
interface Student { apaar: string | null; instStudentId: string | null; name: string | null; programme: string; ay: string; gender: string | null; category: string | null; quota: string | null; status: string }
interface Detail { apaar: string; enrolments: { ay: string; programme: string; name: string | null; dob: string | null; gender: string | null; category: string | null; quota: string | null; status: string; receipt: string }[]; credentials: { certNo: string; degree: string | null; year: number | null; cgpa: string | null; division: string | null; revoked: boolean }[] }

const input = 'h-11 w-full rounded border border-line bg-white px-3 text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-navy/30'

/**
 * Statutory access for NAAC, NBA, NIRF and UGC officers. No student consent is needed, but every access names its
 * legal basis and reference, ends within 30 days, and shows up in each student's access log.
 */
export default function Access() {
  const [insts, setInsts] = useState<Inst[]>([])
  const [bases, setBases] = useState<string[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [f, setF] = useState({ institutionPid: '', basis: '', reference: '', days: '14' })
  const [open, setOpen] = useState<Grant | null>(null)
  const [roster, setRoster] = useState<Student[]>([])
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [err, setErr] = useState('')

  const load = () => api.get<Grant[]>('/regulator/access').then(setGrants).catch((e: Error) => setErr(e.message))
  useEffect(() => {
    void load()
    api.get<Inst[]>('/regulator/institutions').then(setInsts).catch(() => undefined)
    api.get<string[]>('/regulator/bases').then((b) => { setBases(b); setF((x) => ({ ...x, basis: b[0] })) }).catch(() => undefined)
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setErr('')
    try {
      const g = await api.post<Grant>('/regulator/access', { ...f, days: Number(f.days) })
      setF((x) => ({ ...x, reference: '' }))
      await load()
      void view(g)
    } catch (e2) {
      const d = (e2 as { details?: { message: string }[] }).details
      setErr(d?.length ? d.map((x) => x.message).join('. ') : (e2 as Error).message)
    }
  }

  async function view(g: Grant) {
    setErr(''); setDetail(null); setQ('')
    try {
      const r = await api.get<{ students: Student[] }>(`/regulator/access/${g.id}/students`)
      setOpen(g); setRoster(r.students)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function student(apaar: string) {
    try { setDetail(await api.get<Detail>(`/regulator/access/${open!.id}/students/${apaar}`)) } catch (e) { setErr((e as Error).message) }
  }

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? roster.filter((s) => `${s.name} ${s.apaar} ${s.instStudentId} ${s.programme}`.toLowerCase().includes(t)) : roster
  }, [q, roster])
  const summary = useMemo(() => {
    const by = (k: keyof Student) => roster.reduce<Record<string, number>>((m, s) => { const v = String(s[k] ?? 'Not stated'); m[v] = (m[v] ?? 0) + 1; return m }, {})
    return { gender: by('gender'), category: by('category'), linked: roster.filter((s) => s.apaar).length }
  }, [roster])

  return (
    <PortalShell context="Statutory access, logged" nav={[{ to: '/regulator', end: true, label: 'Institution records' }]}>
      <PageTitle title="Institution records" sub="Read an institution’s student records for an assessment, accreditation or inquiry" />
      {err && <p role="alert" className="mb-4 rounded border-l-4 border-err bg-err-bg px-4 py-2 text-sm text-err">{err}</p>}
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Open access">
          <form onSubmit={create} className="grid gap-4" noValidate>
            <label className="text-sm text-muted">Institution
              <select value={f.institutionPid} onChange={(e) => setF({ ...f, institutionPid: e.target.value })} className={`${input} mt-1`}>
                <option value="">Choose…</option>
                {insts.map((i) => <option key={i.pid} value={i.pid}>{i.name}, {i.city} ({i.pid})</option>)}
              </select>
            </label>
            <label className="text-sm text-muted">Legal basis
              <select value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })} className={`${input} mt-1`}>
                {bases.map((b) => <option key={b}>{b}</option>)}
              </select>
            </label>
            <label className="text-sm text-muted">Reference (assessment, order or case number)<input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="NAAC/SSR/2026/MH/0412" className={`${input} mt-1`} /></label>
            <label className="text-sm text-muted">Days (up to 30)<input value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} inputMode="numeric" className={`${input} mt-1 w-28`} /></label>
            <div><button className={btn.primary} disabled={!f.institutionPid || f.reference.trim().length < 3}>Open access</button></div>
            <p className="text-sm text-muted">Each student on the roster is told who looked, under what basis and reference. AICTE’s audit trail records every view.</p>
          </form>
          {grants.length > 0 && (
            <ul className="mt-5 divide-y divide-line border-t border-line">
              {grants.map((g) => (
                <li key={g.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-semibold">{g.institution} <span className="font-mono text-muted">{g.id}</span></p>
                    <p className="text-muted">{g.basis}, {g.reference}</p>
                    <p className="text-xs text-muted">{g.active ? `Open until ${formatDate(g.expiresAt)}` : `Ended ${formatDate(g.expiresAt)}`}</p>
                  </div>
                  {g.active && <button className={btn.secondary} onClick={() => void view(g)}>View</button>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {open && (
          <Panel title={`${open.institution} (${roster.length} students)`} flush>
            <div className="grid gap-3 border-b border-line px-5 py-4 text-sm sm:grid-cols-3">
              <p><span className="text-muted">APAAR linked</span><br /><b>{summary.linked}</b> of {roster.length}</p>
              <p><span className="text-muted">Gender</span><br />{Object.entries(summary.gender).map(([k, v]) => `${k} ${v}`).join(', ')}</p>
              <p><span className="text-muted">Category</span><br />{Object.entries(summary.category).map(([k, v]) => `${k} ${v}`).join(', ')}</p>
            </div>
            <div className="px-5 py-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, APAAR ID or programme" className={input} /></div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[620px] text-[0.9375rem]">
                <thead className="sticky top-0 border-b border-line bg-white"><tr><th className={th}>Student</th><th className={th}>Programme</th><th className={th}>Quota</th><th className={th}>Status</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {shown.slice(0, 300).map((s, i) => (
                    <tr key={`${s.apaar}-${s.instStudentId}-${i}`}>
                      <td className={td}>
                        {s.apaar ? <button className="text-left font-semibold text-navy underline" onClick={() => void student(s.apaar!)}>{s.name}</button> : <span>{s.name}</span>}
                        <p className="font-mono text-sm text-muted">{s.apaar ? formatApaar(s.apaar) : 'No APAAR ID'}</p>
                      </td>
                      <td className={td}>{s.programme}</td>
                      <td className={td}>{s.quota}</td>
                      <td className={td}>{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length > 300 && <p className="px-5 py-3 text-sm text-muted">Showing 300 of {shown.length}. Search to narrow.</p>}
            </div>
            {detail && (
              <div className="border-t border-line px-5 py-4 text-sm">
                <p className="font-semibold">Full record, APAAR {formatApaar(detail.apaar)}</p>
                {detail.enrolments.map((e, i) => <p key={i} className="mt-1">{e.ay}: {e.programme}, {e.quota}, {e.category}, born {e.dob ?? 'not stated'}, {e.status} (receipt {e.receipt})</p>)}
                {detail.credentials.map((c) => <p key={c.certNo} className="mt-1">Degree {c.certNo}: {c.degree}, {c.year}, CGPA {c.cgpa ?? 'n/a'}{c.revoked ? ', revoked' : ''}</p>)}
                {!detail.credentials.length && <p className="mt-1 text-muted">No degree issued yet.</p>}
              </div>
            )}
          </Panel>
        )}
      </div>
    </PortalShell>
  )
}
