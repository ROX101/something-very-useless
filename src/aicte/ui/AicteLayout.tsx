import type { ReactNode } from 'react'
import { PortalShell } from '../../ui/PortalShell'
import { AY } from '../data'

export function AicteLayout({ children }: { children: ReactNode }) {
  return (
    <PortalShell
      context={`All India, academic year ${AY}`}
      nav={[
        { to: '/aicte', end: true, label: 'National overview' },
        { to: '/aicte/alerts', label: 'Compliance alerts' },
        { to: '/aicte/rings', label: 'Duplicate rings' },
        { to: '/aicte/reports', label: 'Reports' },
      ]}>
      {children}
    </PortalShell>
  )
}

export const RULE_NAME: Record<string, string> = {
  R05: 'NRI seats above limit',
  R06: 'Excess admission',
  R07: 'Supernumerary cap exceeded',
  R10: 'Enrolled at another institution',
}
