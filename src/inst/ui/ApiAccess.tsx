import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../../api'
import { useApp } from '../../store'
import { Card, btn, formatDate } from './bits'

interface Key { id: string; name: string; createdBy: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }

const input = 'h-11 w-full rounded border border-line bg-white px-3 text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-navy/30'

/** ERP integration: real API keys for this institution, with a working example request. */
export function ApiAccess({ pid, ay }: { pid: string; ay: string }) {
  const account = useApp((s) => s.account)!
  const isNodal = account.role === 'inst_admin'
  const [keys, setKeys] = useState<Key[]>([])
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState<{ name: string; key: string } | null>(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  const load = () => api.get<Key[]>('/inst/api-keys').then(setKeys).catch((e: Error) => setErr(e.message))
  useEffect(() => { void load() }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setErr('')
    try {
      const k = await api.post<{ name: string; key: string }>('/inst/api-keys', { name })
      setFresh(k)
      setName('')
      void load()
    } catch (e2) {
      setErr((e2 as Error).message)
    }
  }

  async function revoke(id: string) {
    try {
      await api.del(`/inst/api-keys/${id}`)
      void load()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const base = `${window.location.origin}/api/v1`
  const example = `curl -X POST ${base}/institutions/${pid}/enrolments:batch \\
  -H "Authorization: Bearer ${fresh?.key ?? 'apaar_<id>_<secret>'}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{
    "academicYear": "${ay}",
    "mode": "append",
    "records": [
      { "apaarId": "4471 2093 6618", "instStudentId": "ARN26CSE001", "name": "Ritika Deshmukh",
        "dob": "2008-03-15", "gender": "F", "category": "GEN", "programme": "B.Tech CSE",
        "quota": "REGULAR", "nri": "N", "oci": "N", "fn": "N", "nationality": "Indian",
        "admissionDate": "2026-07-20" }
    ]
  }'`

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
      <Card className="p-6">
        <h2 className="text-base font-semibold text-ink">API keys for your ERP</h2>
        <p className="mt-1 text-sm text-muted">Your admissions or ERP system can send students directly instead of an Excel file. Each key acts only for {pid}. Records go through the same validation as an upload; submitting to AICTE stays a step for the nodal officer.</p>

        {fresh && (
          <div role="status" className="mt-4 rounded border-l-4 border-ok bg-ok-bg p-4 text-sm">
            <p className="font-semibold text-ink">Key “{fresh.name}” created. Copy it now; it will not be shown again.</p>
            <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-xs text-ink">{fresh.key}</code>
            <button type="button" className={`${btn.secondary} mt-2`} onClick={() => { void navigator.clipboard?.writeText(fresh.key); setCopied(true) }}>{copied ? 'Copied' : 'Copy key'}</button>
          </div>
        )}

        {isNodal ? (
          <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[12rem] flex-1 text-sm text-muted">Key name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campus ERP (production)" className={`${input} mt-1`} />
            </label>
            <button className={btn.primary} disabled={name.trim().length < 2}>Create key</button>
          </form>
        ) : <p className="mt-4 rounded bg-page px-4 py-3 text-sm text-ink">Only the nodal officer can create or revoke keys.</p>}
        {err && <p role="alert" className="mt-3 text-sm text-err">{err}</p>}

        <ul className="mt-5 divide-y divide-line rounded border border-line">
          {!keys.length && <li className="px-4 py-6 text-center text-sm text-muted">No keys yet.</li>}
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{k.name} <span className="font-mono text-xs text-muted">apaar_{k.id}_…</span></p>
                <p className="text-xs text-muted">Created {formatDate(k.createdAt)} by {k.createdBy}{k.lastUsedAt ? `, last used ${formatDate(k.lastUsedAt)}` : ', never used'}</p>
              </div>
              {k.revokedAt
                ? <span className="text-sm font-semibold text-muted">Revoked {formatDate(k.revokedAt)}</span>
                : isNodal && <button type="button" className={btn.secondary} onClick={() => void revoke(k.id)}>Revoke</button>}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/openapi.json" target="_blank" rel="noreferrer" className="rounded bg-ok-bg px-2 py-0.5 text-xs font-semibold text-igreen underline">OpenAPI 3.1 spec</a>
          <span className="rounded bg-page px-2 py-0.5 text-xs font-semibold text-ink">API key over HTTPS</span>
          <span className="rounded bg-page px-2 py-0.5 text-xs font-semibold text-ink">Up to 1,000 records per call</span>
          <span className="rounded bg-page px-2 py-0.5 text-xs font-semibold text-ink">Idempotent retries</span>
        </div>
        <pre className="mt-4 overflow-x-auto rounded bg-neutral-900 p-5 text-[0.8125rem] leading-relaxed text-neutral-100">{example}</pre>
        <ul className="mt-4 space-y-1 text-sm text-muted">
          <li><code className="text-ink">mode: "replace"</code> starts a fresh set for the year; <code className="text-ink">"append"</code> adds to it, so a large roster can go in several calls.</li>
          <li>The response lists every problem row with the rule, field and any suggested fix.</li>
          <li><code className="text-ink">GET /institutions/{pid}/enrolments/validation</code> returns the current result; <code className="text-ink">GET /institutions/{pid}/students/&#123;id&#125;</code> one student.</li>
        </ul>
      </Card>
    </div>
  )
}
