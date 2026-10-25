import type { RuleCode } from '../inst/engine/types'

export const AY = '2026-27'

export interface AlertRow {
  rowNo: number
  name: string
  studentId: string
  programme: string
  apaar: string
}

export interface AicteAlert {
  id: string
  institution: string
  pid: string
  city: string
  state: string
  rule: RuleCode
  title: string
  detail: string
  clause: string
  detected: string
  live?: boolean
  receiptNo?: string
  hash?: string
  rows?: AlertRow[]
  risk?: number
}

export const STATE_NAME: Record<string, string> = {
  MP: 'Madhya Pradesh', CG: 'Chhattisgarh', TN: 'Tamil Nadu', UP: 'Uttar Pradesh', RJ: 'Rajasthan', TS: 'Telangana',
  AP: 'Andhra Pradesh', GJ: 'Gujarat', KA: 'Karnataka', BR: 'Bihar', MH: 'Maharashtra',
}

export interface Kpis {
  institutions: number
  submitted: number
  records: number
  apaarLinkedPct: number
  exceptionPct: number
  openAlerts: number
  crossDuplicates: number
}

export const EMPTY_KPIS: Kpis = { institutions: 0, submitted: 0, records: 0, apaarLinkedPct: 0, exceptionPct: 0, openAlerts: 0, crossDuplicates: 0 }

export interface WatchItem {
  pid: string
  institution: string
  city: string
  state: string
  risk: number
  reason: string
  factors: { label: string; points: number; clause: string; alertId: string }[]
}

export interface RingInstitution { pid: string; name: string; city: string; state: string }
export interface Ring { from: RingInstitution; to: RingInstitution; students: { apaar: string; name: string | null }[] }

export interface Insights {
  states: import('./states').StateStat[]
  watchlist: WatchItem[]
  rings: Ring[]
}
