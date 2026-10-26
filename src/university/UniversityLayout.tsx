import type { ReactNode } from 'react'
import { PortalShell } from '../ui/PortalShell'

export function UniversityLayout({ children }: { children: ReactNode }) {
  return (
    <PortalShell
      context="Degree-awarding body"
      nav={[
        { to: '/university', end: true, label: 'Students and APAAR IDs' },
        { to: '/university/credentials', label: 'Certificates' },
      ]}>
      {children}
    </PortalShell>
  )
}
