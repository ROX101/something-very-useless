import { create } from 'zustand'
import { api } from '../api'
import { onSignOut } from '../store'
import type { Submission } from '../inst/store'
import { EMPTY_KPIS, type AicteAlert, type Insights, type Kpis } from './data'

export type CaseStatus = 'Open' | 'Referred to Regional Office' | 'Reviewed, no action'

export interface CaseAction {
  status: CaseStatus
  at: string
  by: string
  note: string
}

export interface LiveSubmission {
  submission: Submission
  alerts: AicteAlert[]
  excess: number
}

export type { Kpis } from './data'

interface AicteState {
  alerts: AicteAlert[]
  actions: Record<string, CaseAction>
  live: LiveSubmission | null
  kpis: Kpis | null
  insights: Insights
  loaded: boolean
  error: string | null
  hydrate: () => Promise<void>
  act: (id: string, a: CaseAction) => Promise<void>
}

const NO_INSIGHTS: Insights = { states: [], watchlist: [], rings: [] }
const empty = { alerts: [], actions: {}, live: null, kpis: null, insights: NO_INSIGHTS, loaded: false, error: null }

export const useAicte = create<AicteState>((set, get) => ({
  ...empty,
  hydrate: async () => {
    try {
      const [alerts, actions, live, kpis, insights] = await Promise.all([
        api.get<AicteAlert[]>('/aicte/alerts'),
        api.get<Record<string, CaseAction>>('/aicte/cases'),
        api.get<LiveSubmission | null>('/aicte/live'),
        api.get<Kpis>('/aicte/kpis'),
        api.get<Insights>('/aicte/insights'),
      ])
      set({ alerts, actions, live, kpis, insights, loaded: true, error: null })
    } catch (e) {
      set({ loaded: true, error: (e as Error).message })
    }
  },
  act: async (id, a) => {
    const before = get().actions
    set({ actions: { ...before, [id]: a } })
    try {
      const saved = await api.post<CaseAction>(`/aicte/alerts/${encodeURIComponent(id)}/actions`, { status: a.status, note: a.note })
      set({ actions: { ...get().actions, [id]: saved } })
      // closing or referring changes open-alert counts and risk scores
      void get().hydrate()
    } catch (e) {
      set({ actions: before, error: `Action was not saved: ${(e as Error).message}` })
    }
  },
}))

onSignOut(() => useAicte.setState(empty))

/** Kept for the pages that read case actions: `useCases((s) => s.actions)` and `const { actions, act } = useCases()`. */
export const useCases = useAicte

export function useLiveSubmission() {
  return useAicte((s) => s.live)
}

export function useAllAlerts() {
  return useAicte((s) => s.alerts)
}

export function useKpis(): Kpis {
  return useAicte((s) => s.kpis) ?? EMPTY_KPIS
}

export function statusOf(actions: Record<string, CaseAction>, id: string): CaseStatus {
  return actions[id]?.status ?? 'Open'
}

export function useInsights() {
  return useAicte((s) => s.insights)
}
