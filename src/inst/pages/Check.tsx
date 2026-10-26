import { useState, type FormEvent } from 'react'
import { InstLayout } from '../ui/InstLayout'
import { PageTitle, Panel, btn, formatApaar, formatDate, td, th } from '../ui/bits'
import { api } from '../../api'

interface Enrol { institution: string; city: string; programme: string; ay: string; status: string; statusDate: string | null }
interface Result { apaar: string; found: boolean; name?: string; nameMatches?: boolean; dobMatches?: boolean; activeElsewhere: Enrol[]; history: Enrol[] }

const input = 'h-11 w-full rounded border border-line bg-white px-3 text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-navy/30'
const STATUS: Record<string, string> = { active: 'Studying', withdrawn: 'Withdrawn', transferred: 'Transferred out' }

/** Check an applicant before admission: real APAAR ID, matching name and date of birth, not still studying elsewhere. */
export default function Check() {
  const [apaar, setApaar] = useState('')
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(e: FormEvent) {
    e.preventDefault()
    setErr(''); setRes(null); setBusy(true)
    try {
      const q = new URLSearchParams({ ...(name ? { name } : {}), ...(dob ? { dob } : {}) })
      setRes(await api.get<Result>(`/inst/verify/${apaar.replace(/\s/g, '')}?${q}`))
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const match = (v: boolean | undefined, what: string) => v === undefined ? null : (
    <li className={v ? 'text-ok' : 'font-semibold text-err'}>{v ? `${what} matches the APAAR registry` : `${what} does not match the APAAR registry`}</li>
  )

  return (
    <InstLayout>
      <PageTitle title="APAAR check" sub="Before admitting a student, confirm the APAAR ID and check they are not still enrolled at another institution" />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Applicant">
          <form onSubmit={run} className="grid gap-4" noValidate>
            <label className="text-sm text-muted">APAAR ID<input value={apaar} onChange={(e) => setApaar(e.target.value)} placeholder="12 digits" inputMode="numeric" className={`${input} mt-1 font-mono`} /></label>
            <label className="text-sm text-muted">Name on the application (optional)<input value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1`} /></label>
            <label className="text-sm text-muted">Date of birth (optional)<input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={`${input} mt-1`} /></label>
            <div><button className={btn.primary} disabled={busy || apaar.replace(/\s/g, '').length !== 12}>Check</button></div>
            <p className="text-sm text-muted">The student sees this check in their access log. The registry’s date of birth is never shown, only whether it matches.</p>
          </form>
          {err && <p role="alert" className="mt-3 rounded border-l-4 border-err bg-err-bg px-4 py-2 text-sm text-err">{err}</p>}
        </Panel>

        {res && (
          <Panel title={`APAAR ${formatApaar(res.apaar)}`} flush>
            <div className="px-5 py-4">
              {!res.found ? (
                <p className="font-semibold text-err">This APAAR ID is not in the registry. Ask the student to check it on DigiLocker, or record an exception in the upload.</p>
              ) : (
                <>
                  <p className="text-lg font-semibold">{res.name}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {match(res.nameMatches, 'Name')}
                    {match(res.dobMatches, 'Date of birth')}
                    {res.activeElsewhere.length
                      ? <li className="font-semibold text-err">Still studying at {res.activeElsewhere.map((e) => `${e.institution}, ${e.city}`).join('; ')} this year. Ask for a transfer or withdrawal certificate before admitting.</li>
                      : <li className="text-ok">Not enrolled at any other institution this year</li>}
                  </ul>
                </>
              )}
            </div>
            {res.history.length > 0 && (
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full min-w-[520px] text-[0.9375rem]">
                  <thead className="bg-page/60"><tr><th className={th}>Year</th><th className={th}>Institution</th><th className={th}>Programme</th><th className={th}>Status</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {res.history.map((h, i) => (
                      <tr key={i}>
                        <td className={td}>{h.ay}</td>
                        <td className={td}>{h.institution}<p className="text-sm text-muted">{h.city}</p></td>
                        <td className={td}>{h.programme}</td>
                        <td className={td}>{STATUS[h.status] ?? h.status}{h.statusDate && <p className="text-sm text-muted">{formatDate(h.statusDate)}</p>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </div>
    </InstLayout>
  )
}
