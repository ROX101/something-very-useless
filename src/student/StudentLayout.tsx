import type { ReactNode } from 'react'
import { PortalShell } from '../ui/PortalShell'
import { useConsent } from '../verify/consent'
import { useSync } from '../useSync'

export function StudentLayout({ children }: { children: ReactNode }) {
  useSync(useConsent((s) => s.hydrate), 4000)
  const pending = useConsent((s) => s.requests.filter((r) => r.status === 'Pending').length)
  return (
    <PortalShell
      context="Your academic record"
      nav={[
        { to: '/student', end: true, label: 'My record' },
        { to: '/student/requests', label: pending ? `Verification requests (${pending})` : 'Verification requests' },
        { to: '/student/log', label: 'Access log' },
      ]}>
      {children}
    </PortalShell>
  )
}
