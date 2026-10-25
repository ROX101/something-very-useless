import type { ReactNode } from 'react'
import { PortalShell } from '../../ui/PortalShell'
import { useSync } from '../../useSync'
import { useInst, useValidation } from '../store'

export function InstLayout({ children }: { children: ReactNode }) {
  const result = useValidation()
  const submitted = useInst((s) => s.submissions.length > 0)
  const { loaded, error, hydrate, dismissError } = useInst()
  useSync(hydrate)

  return (
    <PortalShell
      showOrg={false}
      nav={[
        { to: '/inst', end: true, label: 'Dashboard' },
        { to: '/inst/upload', label: 'Upload and validate', done: Boolean(result) && result!.dataErrors === 0 },
        { to: '/inst/ledger', label: 'Seat ledger' },
        { to: '/inst/submit', label: 'Submit to AICTE', done: submitted },
      ]}>
      {error && (
        <div role="alert" className="mb-5 flex items-start justify-between gap-4 rounded border-l-4 border-err bg-err-bg px-4 py-3 text-sm text-err">
          <span>{error}</span>
          <button type="button" onClick={dismissError} className="font-semibold underline">Dismiss</button>
        </div>
      )}
      {loaded ? children : <p className="py-16 text-center text-muted">Loading your institution’s data…</p>}
    </PortalShell>
  )
}
