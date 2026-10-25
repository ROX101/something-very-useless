import { create } from 'zustand'
import { api } from '../api'
import { onSignOut } from '../store'
import type { Submission } from '../inst/store'
import { BASE, type AicteAlert } from './data'

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

export type Kpis = typeof BASE & { submitted: number }

interface AicteState {
  alerts: AicteAlert[]
  actions: Record<string, CaseAction>
  live: LiveSubmission | null
  kpis: Kpis | null
  loaded: boolean
  error: string | null
  hydrate: () => Promise<void>
  act: (id: string, a: CaseAction) => Promise<void>
}

const empty = { alerts: [], actions: {}, live: null, kpis: null, loaded: false, error: null }

export const useAicte = create<AicteState>((set, get) => ({
  ...empty,
  hydrate: async () => {
    try {
      const [alerts, actions, live, kpis] = await Promise.all([
        api.get<AicteAlert[]>('/aicte/alerts'),
        api.get<Record<string, CaseAction>>('/aicte/cases'),
        api.get<LiveSubmission | null>('/aicte/live'),
        api.get<Kpis>('/aicte/kpis'),
      ])
      set({ alerts, actions, live, kpis, loaded: true, error: null })
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
  return useAicte((s) => s.kpis) ?? { ...BASE }
}

export function statusOf(actions: Record<string, CaseAction>, id: string): CaseStatus {
  return actions[id]?.status ?? 'Open'
}
