import { create } from 'zustand'
import { useMemo } from 'react'
import { useInst, useValidation } from '../inst/store'
import { INSTITUTION } from '../inst/data/reference'
import { BASE, SAMPLE_ALERTS, type AicteAlert } from './data'

export type CaseStatus = 'Open' | 'Referred to Regional Office' | 'Reviewed, no action'

export interface CaseAction {
  status: CaseStatus
  at: string
  by: string
  note: string
}

const KEY = 'as.aicte.cases'

function load(): Record<string, CaseAction> {
  try {
    const v = localStorage.getItem(KEY)
    return v ? (JSON.parse(v) as Record<string, CaseAction>) : {}
  } catch {
    return {}
  }
}

interface CaseState {
  actions: Record<string, CaseAction>
  act: (id: string, a: CaseAction) => void
}

export const useCases = create<CaseState>((set, get) => ({
  actions: load(),
  act: (id, a) => {
    const actions = { ...get().actions, [id]: a }
    set({ actions })
    try {
      localStorage.setItem(KEY, JSON.stringify(actions))
    } catch {
      return
    }
  },
}))

export function useLiveSubmission() {
  const submissions = useInst((s) => s.submissions)
  const result = useValidation()
  const latest = submissions[0]
  return useMemo(() => {
    if (!latest || !result) return null
    const byRow = new Map(result.rows.map((r) => [r.row.rowNo, r.row]))
    const alerts: AicteAlert[] = result.alerts.map((a) => ({
      id: `L-${latest.receiptNo}-${a.id}`,
      institution: INSTITUTION.name,
      pid: INSTITUTION.pid,
      city: INSTITUTION.city,
      state: 'MH',
      rule: a.rule,
      title: a.title,
      detail: a.detail,
      clause: a.clause,
      detected: latest.submittedAt,
      live: true,
      receiptNo: latest.receiptNo,
      hash: latest.hash,
      rows: a.rowNos.map((n) => {
        const r = byRow.get(n)!
        return { rowNo: n, name: r.NAME, studentId: r.INST_STUDENT_ID, programme: r.PROGRAMME, apaar: r.APAAR_ID }
      }),
    }))
    return { submission: latest, alerts, excess: result.ledger.reduce((n, l) => n + l.excess, 0) }
  }, [latest, result])
}

export function useAllAlerts() {
  const live = useLiveSubmission()
  return useMemo(() => [...(live?.alerts ?? []), ...SAMPLE_ALERTS], [live])
}

export function useKpis() {
  const live = useLiveSubmission()
  return {
    institutions: BASE.institutions,
    submitted: BASE.submitted + (live ? 1 : 0),
    records: BASE.records + (live ? live.submission.records : 0),
    apaarLinkedPct: BASE.apaarLinkedPct,
    exceptionPct: BASE.exceptionPct,
    openAlerts: BASE.openAlerts + (live ? live.alerts.length : 0),
    crossDuplicates: BASE.crossDuplicates,
  }
}

export function statusOf(actions: Record<string, CaseAction>, id: string): CaseStatus {
  return actions[id]?.status ?? 'Open'
}
