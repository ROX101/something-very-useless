import type { ReactNode } from 'react'
import { PortalShell } from '../ui/PortalShell'
import { useSync } from '../useSync'
import { useConsent } from '../verify/consent'

export function VerifierLayout({ children }: { children: ReactNode }) {
  useSync(useConsent((s) => s.hydrate), 4000)
  return (
    <PortalShell
      context="Registered verifier"
      nav={[
        { to: '/verify', end: true, label: 'Verify a certificate' },
        { to: '/verify/requests', label: 'Consent requests' },
      ]}>
      {children}
    </PortalShell>
  )
}
