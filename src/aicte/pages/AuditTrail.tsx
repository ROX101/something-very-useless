import { Fragment, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { PortalShell } from '../../ui/PortalShell'
import { PageTitle, Panel, btn, td, th } from '../../inst/ui/bits'
import { audit, useAudit, verifyChain, type ChainCheck } from '../../audit/log'
import { useSync } from '../../useSync'

export const ADMIN_NAV = [{ to: '/aicte/admin', end: true, label: 'Audit trail' }, { to: '/aicte/admin/registrations', label: 'Registrations' }]

const CATEGORIES = ['All categories', 'Sign-in', 'Data', 'Submission', 'Compliance', 'Consent', 'Verification', 'Reports', 'Registration', 'Administration', 'System']
const PAGE = 25

const field = 'h-11 rounded border border-line bg-white px-3 text-[0.9375rem] text-ink focus:outline-none focus:ring-2 focus:ring-navy/30'

const eventId = (seq: number) => `EV-${String(seq).padStart(6, '0')}`

function stamp(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const dayOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AuditTrail() {
  const entries = useAudit((s) => s.entries)
  const { load, loaded, error } = useAudit()
  useSync(load, 15000)
  const [check, setCheck] = useState<ChainCheck | null>(null)
  const [checkedAt, setCheckedAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState(CATEGORIES[0])
  const [user, setUser] = useState('All users')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<number | null>(null)

  async function run(fresh = false) {
    setBusy(true)
    if (fresh) await load()
    const res = await verifyChain(useAudit.getState().entries)
    setCheck(res)
    setCheckedAt(new Date().toISOString())
    setBusy(false)
  }

  useEffect(() => { if (loaded) void run() }, [entries, loaded])

  const users = useMemo(() => ['All users', ...[...new Set(entries.map((e) => e.actor))].sort()], [entries])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...entries].reverse().filter((e) => {
      const d = dayOf(e.at)
      return (category === CATEGORIES[0] || e.category === category) &&
        (user === 'All users' || e.actor === user) &&
        (!from || d >= from) && (!to || d <= to) &&
        (!needle || `${eventId(e.seq)} ${e.actor} ${e.role} ${e.org} ${e.action} ${e.detail}`.toLowerCase().includes(needle))
    })
  }, [entries, category, user, from, to, q])

  useEffect(() => { setPage(0) }, [category, user, from, to, q])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const view = rows.slice(page * PAGE, page * PAGE + PAGE)
  const failed = check && !check.ok
  const last = entries[entries.length - 1]

  function exportXlsx() {
    audit('Administration', 'Exported audit trail', `${rows.length} events`)
    const ws = XLSX.utils.aoa_to_sheet([
      ['Audit trail, AY 2026-27'],
      [`Exported ${stamp(new Date().toISOString())}`],
      [],
      ['Event ID', 'Timestamp', 'User', 'Role', 'Organisation', 'Category', 'Event', 'Details', 'Previous hash', 'Hash'],
      ...rows.map((e) => [eventId(e.seq), stamp(e.at), e.actor, e.role, e.org, e.category, e.action, e.detail, e.prev, e.hash]),
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Audit trail')
    XLSX.writeFile(wb, 'Audit_trail_AY2026-27.xlsx')
  }

  function clear() {
    setCategory(CATEGORIES[0]); setUser('All users'); setFrom(''); setTo(''); setQ('')
  }

  return (
    <PortalShell context="Platform administration" nav={ADMIN_NAV}>
      <PageTitle title="Audit trail" sub="System activity log, AY 2026-27"
        actions={<button className={btn.secondary} onClick={exportXlsx}>Export (.xlsx)</button>} />

      {error && <p role="alert" className="mb-5 rounded border-l-4 border-err bg-err-bg px-4 py-3 text-sm text-err">{error}</p>}
      {!loaded && <p className="mb-5 text-muted">Loading the audit trail…</p>}
      <section className="grid rounded border border-line bg-white sm:grid-cols-2 xl:grid-cols-4">
        <div className="border-b border-line p-5 xl:border-b-0 xl:border-r sm:border-r">
          <p className="text-sm text-muted">Events</p>
          <p className="mt-1 text-3xl font-semibold text-ink tnum">{entries.length.toLocaleString('en-IN')}</p>
        </div>
        <div className="border-b border-line p-5 xl:border-b-0 xl:border-r">
          <p className="text-sm text-muted">Users</p>
          <p className="mt-1 text-3xl font-semibold text-ink tnum">{users.length - 1}</p>
        </div>
        <div className="border-b border-line p-5 sm:border-b-0 sm:border-r">
          <p className="text-sm text-muted">Last event</p>
          <p className="mt-1 text-base font-semibold text-ink">{last ? last.action : 'None'}</p>
          <p className="text-sm text-muted">{last ? stamp(last.at) : ''}</p>
        </div>
        <div className="p-5">
          <p className="text-sm text-muted">Integrity</p>
          <p className={`mt-1 text-3xl font-semibold ${!check ? 'text-muted' : failed ? 'text-err' : 'text-ok'}`}>
            {!check ? 'Checking' : failed ? 'Failed' : 'Verified'}
          </p>
        </div>
      </section>

      <div className={`mt-6 flex flex-col gap-3 border-l-4 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${failed ? 'border-err' : 'border-ok'}`} role="status">
        <p className="text-[0.9375rem] text-ink">
          {failed
            ? <><strong className="text-err">Integrity check failed at {eventId(check?.brokenAt ?? 0)}.</strong> {check?.reason}. Events from {eventId(check?.brokenAt ?? 0)} onwards cannot be trusted.</>
            : <><strong>Hash chain verified.</strong> {check?.checked ?? 0} of {entries.length} events valid (SHA-256).</>}
          {checkedAt && <span className="text-muted"> Last checked {stamp(checkedAt)}.</span>}
        </p>
        <button className={`${btn.primary} shrink-0`} onClick={() => void run(true)} disabled={busy}>{busy ? 'Verifying' : 'Verify integrity'}</button>
      </div>

      <Panel className="mt-6" flush title={`Events (${rows.length.toLocaleString('en-IN')})`}>
        <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.6fr)_auto] xl:items-end">
          <label className="text-sm text-muted">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} mt-1 w-full`} />
          </label>
          <label className="text-sm text-muted">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} mt-1 w-full`} />
          </label>
          <label className="text-sm text-muted">Category
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} mt-1 w-full`}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-sm text-muted">User
            <select value={user} onChange={(e) => setUser(e.target.value)} className={`${field} mt-1 w-full`}>
              {users.map((u) => <option key={u}>{u}</option>)}
            </select>
          </label>
          <label className="text-sm text-muted">Search
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="EV-000012, receipt, APAAR" className={`${field} mt-1 w-full`} />
          </label>
          <button className={`${btn.secondary} h-11`} onClick={clear}>Clear filters</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[0.9375rem]">
            <thead className="border-b border-line bg-page/60">
              <tr>
                <th className={th}>Event ID</th><th className={th}>Timestamp (IST)</th><th className={th}>User</th>
                <th className={th}>Category</th><th className={th}>Event</th><th className={th}>Details</th><th className={th}>Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.map((e) => {
                const bad = failed && check?.brokenAt !== undefined && e.seq >= check.brokenAt
                const expanded = open === e.seq
                return (
                  <Fragment key={e.seq}>
                    <tr className={`cursor-pointer hover:bg-page/60 ${bad ? 'bg-err-bg' : ''}`} onClick={() => setOpen(expanded ? null : e.seq)}
                      aria-expanded={expanded}>
                      <td className={`${td} whitespace-nowrap font-mono text-sm`}>
                        <button type="button" className="text-ink underline-offset-2 hover:underline" onClick={(ev) => { ev.stopPropagation(); setOpen(expanded ? null : e.seq) }}>{eventId(e.seq)}</button>
                      </td>
                      <td className={`${td} whitespace-nowrap text-sm text-muted tnum`}>{stamp(e.at)}</td>
                      <td className={td}>
                        <p className="font-medium text-ink">{e.actor}</p>
                        <p className="text-sm text-muted">{e.role}{e.org && e.org !== e.actor ? `, ${e.org}` : ''}</p>
                      </td>
                      <td className={`${td} whitespace-nowrap text-sm text-ink`}>{e.category}</td>
                      <td className={`${td} font-medium text-ink`}>{e.action}</td>
                      <td className={`${td} max-w-[28rem] text-sm text-ink`}>{e.detail}</td>
                      <td className={`${td} whitespace-nowrap font-mono text-sm ${bad ? 'text-err' : 'text-muted'}`}>{e.hash.slice(0, 12)}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-page/60">
                        <td colSpan={7} className="px-4 py-4">
                          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                            <dt className="text-muted">Hash (SHA-256)</dt><dd className="break-all font-mono text-ink">{e.hash}</dd>
                            <dt className="text-muted">Previous hash</dt><dd className="break-all font-mono text-ink">{e.prev}</dd>
                            <dt className="text-muted">Recorded</dt><dd className="text-ink">{new Date(e.at).toISOString()}</dd>
                            <dt className="text-muted">Organisation</dt><dd className="text-ink">{e.org || 'None'}</dd>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {!view.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No events match these filters.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-muted">
          <span>Showing {rows.length ? page * PAGE + 1 : 0}–{Math.min(rows.length, (page + 1) * PAGE)} of {rows.length.toLocaleString('en-IN')}</span>
          <div className="flex gap-2">
            <button className={btn.secondary} onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</button>
            <button className={btn.secondary} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>Next</button>
          </div>
        </div>
      </Panel>
    </PortalShell>
  )
}
