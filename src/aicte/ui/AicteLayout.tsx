import type { ReactNode } from 'react'
import { PortalShell } from '../../ui/PortalShell'
import { useSync } from '../../useSync'
import { useAicte } from '../store'
import { AY } from '../data'
import { useApp } from '../../store'

export function AicteLayout({ children }: { children: ReactNode }) {
  const { loaded, error, hydrate } = useAicte()
  useSync(hydrate, 15000)
  const account = useApp((st) => st.account)
  const regional = account?.role === 'aicte_regional'

  return (
    <PortalShell
      context={regional ? `${account!.scope}, academic year ${AY}` : `All India, academic year ${AY}`}
      nav={[
        { to: '/aicte', end: true, label: regional ? 'Regional overview' : 'National overview' },
        { to: '/aicte/alerts', label: 'Compliance alerts' },
        { to: '/aicte/rings', label: 'Duplicate rings' },
        { to: '/aicte/reports', label: 'Reports' },
      ]}>
      {error && (
        <div role="alert" className="mb-5 rounded border-l-4 border-err bg-err-bg px-4 py-3 text-sm text-err">{error}</div>
      )}
      {loaded ? children : <p className="py-16 text-center text-muted">{regional ? 'Loading your region’s data…' : 'Loading national data…'}</p>}
    </PortalShell>
  )
}

export const RULE_NAME: Record<string, string> = {
  R05: 'NRI seats above limit',
  R06: 'Excess admission',
  R07: 'Supernumerary cap exceeded',
  R10: 'Enrolled at another institution',
  R11: 'Probable duplicate at another institution',
}
