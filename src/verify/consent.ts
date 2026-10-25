import { create } from 'zustand'
import { api } from '../api'
import { onSignOut, useApp } from '../store'

export const SHARED_FIELDS = ['Name', 'Degree', 'Year of award', 'Award status']
export const PRIVATE_FIELDS = ['Marks and CGPA', 'Category', 'Address', 'Date of birth']

export const PURPOSES = [
  { id: 'pre-employment', label: 'Pre-employment background verification', reference: 'Offer letter number', example: 'TSPL/HR/OL/2026/1187' },
  { id: 'appointment', label: 'Verification of qualification for appointment or promotion', reference: 'Appointment order number', example: 'TSPL/HR/AO/2026/0342' },
  { id: 'admission', label: 'Admission to a higher education programme', reference: 'Application number', example: 'PG-2026-004571' },
  { id: 'loan', label: 'Education loan or scholarship sanction', reference: 'Loan or scholarship application number', example: 'EDL/26/77120' },
  { id: 'registration', label: 'Registration with a professional body', reference: 'Registration application number', example: 'REG/2026/11093' },
] as const

export const RETENTION = [30, 90, 180]

export type RequestStatus = 'Pending' | 'Approved' | 'Refused' | 'Revoked' | 'Expired'

export interface VerificationRequest {
  id: string
  apaar: string
  verifier: string
  verifierOrg: string
  purpose: string
  reference: string
  validityDays: number
  retentionDays: number
  createdAt: string
  status: RequestStatus
  decidedAt?: string
  consentNo?: string
  expiresAt?: string
}

export interface AccessEntry {
  id: string
  at: string
  actor: string
  action: string
}

/** What a verifier may see once the student has allowed it (served by /api/verifier/records/:apaar). */
export interface SharedRecord {
  consentNo: string
  expiresAt: string
  name: string
  degree: string | null
  year: number | null
  status: string
  certNo: string | null
}

interface ConsentState {
  requests: VerificationRequest[]
  log: AccessEntry[]
  loaded: boolean
  error: string | null
  hydrate: () => Promise<void>
  decide: (id: string, status: 'Approved' | 'Refused') => Promise<void>
  revoke: (id: string) => Promise<void>
  request: (r: Omit<VerificationRequest, 'id' | 'createdAt' | 'status' | 'verifier' | 'verifierOrg'> & Partial<Pick<VerificationRequest, 'verifier' | 'verifierOrg'>>) => Promise<void>
  /** Consent-gated, logged read of a student's shared fields. Returns null when there is no active consent. */
  view: (apaar: string) => Promise<SharedRecord | null>
}

const empty = { requests: [], log: [], loaded: false, error: null }

export const useConsent = create<ConsentState>((set, get) => ({
  ...empty,

  hydrate: async () => {
    const role = useApp.getState().account?.role
    try {
      if (role === 'student') {
        const [requests, log] = await Promise.all([
          api.get<VerificationRequest[]>('/student/requests'),
          api.get<AccessEntry[]>('/student/log'),
        ])
        set({ requests, log, loaded: true, error: null })
      } else if (role === 'verifier') {
        set({ requests: await api.get<VerificationRequest[]>('/verifier/requests'), loaded: true, error: null })
      }
    } catch (e) {
      set({ loaded: true, error: (e as Error).message })
    }
  },

  decide: async (id, status) => {
    try {
      const updated = await api.post<VerificationRequest>(`/student/requests/${id}/decide`, { status })
      set({ requests: get().requests.map((r) => (r.id === id ? updated : r)) })
    } catch (e) {
      set({ error: (e as Error).message })
    }
    await get().hydrate()
  },

  revoke: async (id) => {
    try {
      const updated = await api.post<VerificationRequest>(`/student/requests/${id}/revoke`)
      set({ requests: get().requests.map((r) => (r.id === id ? updated : r)) })
    } catch (e) {
      set({ error: (e as Error).message })
    }
    await get().hydrate()
  },

  request: async (r) => {
    const created = await api.post<VerificationRequest>('/verifier/requests', {
      apaar: r.apaar, purpose: r.purpose, reference: r.reference, validityDays: r.validityDays, retentionDays: r.retentionDays,
    })
    set({ requests: [created, ...get().requests], error: null })
  },

  view: async (apaar) => {
    try {
      return await api.get<SharedRecord>(`/verifier/records/${apaar}`)
    } catch {
      return null
    }
  },
}))

onSignOut(() => useConsent.setState(empty))

export function activeConsent(requests: VerificationRequest[], apaar: string, org: string) {
  const now = Date.now()
  return requests.find((r) => r.apaar === apaar && r.verifierOrg === org && r.status === 'Approved' && r.expiresAt && new Date(r.expiresAt).getTime() > now)
}
