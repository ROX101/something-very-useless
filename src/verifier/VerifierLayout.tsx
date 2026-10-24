import type { ReactNode } from 'react'
import { PortalShell } from '../ui/PortalShell'

export const VERIFIER = { name: 'Kabir Menon', org: 'Tarang Software Pvt. Ltd.' }

export function VerifierLayout({ children }: { children: ReactNode }) {
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
