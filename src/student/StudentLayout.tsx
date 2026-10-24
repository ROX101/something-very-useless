import type { ReactNode } from 'react'
import { PortalShell } from '../ui/PortalShell'
import { useConsent } from '../verify/consent'

export const STUDENT = {
  name: 'Ritika Deshmukh',
  apaar: '447120936618',
  studentId: 'GTU/2022/CSE/0417',
  university: 'Godavari Technological University',
  programme: 'B.Tech Computer Science & Engineering',
  mobile: '+91 ••••• ••321',
}

export function StudentLayout({ children }: { children: ReactNode }) {
  const pending = useConsent((s) => s.requests.filter((r) => r.apaar === STUDENT.apaar && r.status === 'Pending').length)
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
