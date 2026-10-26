import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { InstLayout } from '../ui/InstLayout'
import { PageTitle, Panel, btn, formatApaar, formatDate, td, th } from '../ui/bits'
import { api } from '../../api'
import { PROGRAMMES } from '../data/reference'

type EventType = 'withdrawn' | 'transferred' | 'name_corrected' | 'lateral_entry' | 'reinstated'
interface Student { instStudentId: string; apaar: string | null; name: string; programme: string; quota: string; status: string; statusDate: string | null; statusNote: string | null; entry: string }
interface Ev { id: number; type: EventType; label: string; instStudentId: string; apaar: string | null; date: string; note: string; by: string; at: string; data: { newName?: string; toInstitution?: string; name?: string } }

const TYPES: { id: EventType; label: string; help: string }[] = [
  { id: 'withdrawn', label: 'Withdrawal', help: 'The student has left. They stop counting as enrolled here, and can be admitted elsewhere without a duplicate alert.' },
  { id: 'transferred', label: 'Transfer out', help: 'The student moved to another institution. NBA N1 subtracts students who migrated out.' },
  { id: 'name_corrected', label: 'Name correction', help: 'Corrects the name on this year’s return. The APAAR registry itself is corrected through DigiLocker.' },
  { id: 'lateral_entry', label: 'Lateral entry', help: 'A diploma holder joining the second year (NBA N2). Checked against the national register first.' },
  { id: 'reinstated', label: 'Reinstatement', help: 'Undo a withdrawal or transfer recorded by mistake.' },
]
const STATUS: Record<string, string> = { active: 'Studying', withdrawn: 'Withdrawn', transferred: 'Transferred out' }
const input = 'h-11 w-full rounded border border-line bg-white px-3 text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-navy/30'
const today = () => new Date().toISOString().slice(0, 10)
const blankLateral = { apaar: '', name: '', dob: '', gender: 'F', category: 'GEN', programme: PROGRAMMES[0]?.label ?? '', quota: 'REGULAR' }

/** Withdrawals, transfers, name corrections and lateral entries after the year's return was submitted. */
export default function Students() {
  const [students, setStudents] = useState<Student[]>([])
  const [events, setEvents] = useState<Ev[]>([])
  const [type, setType] = useState<EventType>('withdrawn')
  const [student, setStudent] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [newName, setNewName] = useState('')
  const [toInstitution, setTo] = useState('')
  const [lat, setLat] = useState(blankLateral)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const load = () => api.get<{ students: Student[]; events: Ev[] }>('/inst/students').then((r) => { setStudents(r.students); setEvents(r.events) }).catch((e: Error) => setErr(e.message))
  useEffect(() => { void load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setOk('')
    try {
      const r = await api.post<{ label: string; instStudentId: string }>('/inst/students/events', {
        type, student: student.trim(), date, note,
        ...(type === 'name_corrected' ? { newName } : {}),
        ...(type === 'transferred' && toInstitution ? { toInstitution } : {}),
        ...(type === 'lateral_entry' ? { lateral: lat } : {}),
      })
      setOk(`${r.label} recorded for ${r.instStudentId}.`)
      setStudent(''); setNote(''); setNewName(''); setTo(''); setLat(blankLateral)
      void load()
    } catch (e2) {
      const d = (e2 as { details?: { path: (string | number)[]; message: string }[] }).details
      setErr(d?.length ? d.map((x) => `${x.path.join('.')}: ${x.message}`).join('. ') : (e2 as Error).message)
    }
  }

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = t ? students.filter((s) => `${s.name} ${s.instStudentId} ${s.apaar} ${s.programme}`.toLowerCase().includes(t)) : students.filter((s) => s.status !== 'active' || s.entry === 'lateral')
    return list.slice(0, 200)
  }, [q, students])
  const counts = useMemo(() => ({
    active: students.filter((s) => s.status === 'active').length,
    left: students.filter((s) => s.status !== 'active').length,
    lateral: students.filter((s) => s.entry === 'lateral').length,
  }), [students])
  const help = TYPES.find((t) => t.id === type)!.help
  const setL = (k: keyof typeof blankLateral) => (e: { target: { value: string } }) => setLat((x) => ({ ...x, [k]: e.target.value }))

  return (
    <InstLayout>
      <PageTitle title="In-year updates" sub={`${counts.active} studying, ${counts.left} withdrawn or transferred, ${counts.lateral} lateral entries`} />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Record a change">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <label className="text-sm text-muted sm:col-span-2">Change
              <select value={type} onChange={(e) => setType(e.target.value as EventType)} className={`${input} mt-1`}>
                {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <p className="text-sm text-muted sm:col-span-2">{help}</p>
            <label className="text-sm text-muted">{type === 'lateral_entry' ? 'New institution student ID' : 'Student ID or APAAR ID'}
              <input value={student} onChange={(e) => setStudent(e.target.value)} className={`${input} mt-1 font-mono`} list={type === 'lateral_entry' ? undefined : 'roster-ids'} />
            </label>
            <label className="text-sm text-muted">Effective date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} mt-1`} /></label>
            {type === 'name_corrected' && <label className="text-sm text-muted sm:col-span-2">Corrected name<input value={newName} onChange={(e) => setNewName(e.target.value)} className={`${input} mt-1`} /></label>}
            {type === 'transferred' && <label className="text-sm text-muted sm:col-span-2">Transferred to (optional)<input value={toInstitution} onChange={(e) => setTo(e.target.value)} className={`${input} mt-1`} /></label>}
            {type === 'lateral_entry' && (
              <>
                <label className="text-sm text-muted">APAAR ID<input value={lat.apaar} onChange={setL('apaar')} placeholder="12 digits" className={`${input} mt-1 font-mono`} /></label>
                <label className="text-sm text-muted">Name<input value={lat.name} onChange={setL('name')} className={`${input} mt-1`} /></label>
                <label className="text-sm text-muted">Date of birth<input type="date" value={lat.dob} onChange={setL('dob')} className={`${input} mt-1`} /></label>
                <label className="text-sm text-muted">Gender
                  <select value={lat.gender} onChange={setL('gender')} className={`${input} mt-1`}><option value="F">Female</option><option value="M">Male</option><option value="T">Transgender</option></select>
                </label>
                <label className="text-sm text-muted">Category
                  <select value={lat.category} onChange={setL('category')} className={`${input} mt-1`}>{['GEN', 'EWS', 'OBC-NCL', 'SC', 'ST'].map((c) => <option key={c}>{c}</option>)}</select>
                </label>
                <label className="text-sm text-muted">Programme
                  <select value={lat.programme} onChange={setL('programme')} className={`${input} mt-1`}>{PROGRAMMES.map((p) => <option key={p.code} value={p.label}>{p.label}</option>)}</select>
                </label>
              </>
            )}
            <label className="text-sm text-muted sm:col-span-2">Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reference, order number or reason" className={`${input} mt-1`} /></label>
            <div className="sm:col-span-2"><button className={btn.primary} disabled={!student.trim() || !date}>Record</button></div>
          </form>
          <datalist id="roster-ids">{students.slice(0, 2000).map((s) => <option key={s.instStudentId} value={s.instStudentId}>{s.name}</option>)}</datalist>
          {err && <p role="alert" className="mt-3 rounded border-l-4 border-err bg-err-bg px-4 py-2 text-sm text-err">{err}</p>}
          {ok && <p role="status" className="mt-3 rounded border-l-4 border-ok bg-ok-bg px-4 py-2 text-sm">{ok} AICTE’s register and the student’s access log are updated.</p>}
        </Panel>

        <div className="min-w-0 space-y-6">
          <Panel title="Roster" flush>
            <div className="px-5 py-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search to see any student; otherwise changed students are listed" className={input} /></div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[560px] text-[0.9375rem]">
                <thead className="sticky top-0 border-b border-line bg-white"><tr><th className={th}>Student</th><th className={th}>Programme</th><th className={th}>Status</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {!shown.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted">{q ? 'No match.' : 'No changes recorded yet.'}</td></tr>}
                  {shown.map((s) => (
                    <tr key={s.instStudentId}>
                      <td className={td}><p>{s.name}</p><p className="font-mono text-sm text-muted">{s.instStudentId}{s.apaar ? `, ${formatApaar(s.apaar)}` : ''}</p></td>
                      <td className={td}>{s.programme}{s.entry === 'lateral' && <p className="text-xs font-semibold text-muted">Lateral entry</p>}</td>
                      <td className={td}><span className={s.status === 'active' ? 'text-ok' : 'font-semibold text-warn'}>{STATUS[s.status] ?? s.status}</span>{s.statusDate && <p className="text-xs text-muted">{formatDate(s.statusDate)}{s.statusNote ? `, ${s.statusNote}` : ''}</p>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title={`History (${events.length})`} flush>
            <ul className="divide-y divide-line">
              {!events.length && <li className="px-5 py-6 text-center text-muted">Nothing recorded.</li>}
              {events.map((e) => (
                <li key={e.id} className="px-5 py-3 text-sm">
                  <p><b>{e.label}</b> <span className="font-mono">{e.instStudentId}</span>{e.data.newName ? ` to “${e.data.newName}”` : ''}{e.data.name ? `, ${e.data.name}` : ''}{e.data.toInstitution ? `, to ${e.data.toInstitution}` : ''}, effective {formatDate(e.date)}</p>
                  <p className="text-muted">{e.note && `${e.note}. `}By {e.by}, {formatDate(e.at)}</p>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-5 py-3 text-sm text-muted">Changes are kept with the return. A revised Excel upload does not undo them.</p>
          </Panel>
        </div>
      </div>
    </InstLayout>
  )
}
