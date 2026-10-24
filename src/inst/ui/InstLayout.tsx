import type { ReactNode } from 'react'
import { PortalShell } from '../../ui/PortalShell'
import { useInst, useValidation } from '../store'

export function InstLayout({ children }: { children: ReactNode }) {
  const result = useValidation()
  const submitted = useInst((s) => s.submissions.length > 0)
  return (
    <PortalShell
      showOrg={false}
      nav={[
        { to: '/inst', end: true, label: 'Dashboard' },
        { to: '/inst/upload', label: 'Upload and validate', done: Boolean(result) && result!.dataErrors === 0 },
        { to: '/inst/ledger', label: 'Seat ledger' },
        { to: '/inst/submit', label: 'Submit to AICTE', done: submitted },
      ]}>
      {children}
    </PortalShell>
  )
}
