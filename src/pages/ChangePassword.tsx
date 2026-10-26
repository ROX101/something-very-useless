import { useState, type FormEvent } from 'react'
import { PortalShell } from '../ui/PortalShell'
import { PageTitle, Panel, btn } from '../inst/ui/bits'
import { api } from '../api'
import { useApp } from '../store'
import type { Account } from '../auth/directory'

const input = 'h-11 w-full rounded border border-line bg-white px-3 text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-navy/30'

/** Shown instead of any portal page until a new account replaces its one-time password. */
export default function ChangePassword() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    if (next !== again) { setErr('The two new passwords do not match.'); return }
    setBusy(true)
    try {
      const r = await api.post<{ account: Account }>('/auth/password', { current, next })
      useApp.getState().signIn(r.account)
    } catch (e2) {
      const d = (e2 as { details?: { message: string }[] }).details
      setErr(d?.length ? d.map((x) => x.message).join('. ') : (e2 as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PortalShell context="Account set-up">
      <div className="mx-auto max-w-lg">
        <PageTitle title="Choose your password" sub="Your account was created with a one-time password. Replace it before you continue." />
        <Panel>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <label className="text-sm text-muted">One-time password<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={`${input} mt-1`} /></label>
            <label className="text-sm text-muted">New password<input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={`${input} mt-1`} /></label>
            <label className="text-sm text-muted">New password again<input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={`${input} mt-1`} /></label>
            <p className="text-sm text-muted">At least 10 characters, with a letter and a number.</p>
            {err && <p role="alert" className="rounded border-l-4 border-err bg-err-bg px-4 py-2 text-sm text-err">{err}</p>}
            <div><button className={btn.primary} disabled={busy || !current || !next}>Save password</button></div>
          </form>
        </Panel>
      </div>
    </PortalShell>
  )
}
