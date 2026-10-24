import { create } from 'zustand'

export const SHARED_FIELDS = ['Name', 'Degree', 'Year of award', 'Award status']
export const PRIVATE_FIELDS = ['Marks and CGPA', 'Category', 'Address', 'Date of birth']

export type RequestStatus = 'Pending' | 'Approved' | 'Refused' | 'Revoked' | 'Expired'

export interface VerificationRequest {
  id: string
  apaar: string
  verifier: string
  verifierOrg: string
  purpose: string
  validityDays: number
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

interface Persisted {
  requests: VerificationRequest[]
  log: AccessEntry[]
  seq: number
}

const KEY = 'as.consent'
const STUDENT_APAAR = '447120936618'

function seed(): Persisted {
  const now = new Date()
  return {
    seq: 7731,
    requests: [{
      id: 'RQ-1001', apaar: STUDENT_APAAR, verifier: 'Kabir Menon', verifierOrg: 'Tarang Software Pvt. Ltd.',
      purpose: 'Employment verification', validityDays: 7, createdAt: new Date(now.getTime() - 4 * 60000).toISOString(), status: 'Pending',
    }],
    log: [{ id: 'LG-1', at: new Date(now.getTime() - 4 * 60000).toISOString(), actor: 'Tarang Software Pvt. Ltd.', action: 'Requested to verify your degree' }],
  }
}

function load(): Persisted {
  try {
    const v = localStorage.getItem(KEY)
    return v ? (JSON.parse(v) as Persisted) : seed()
  } catch {
    return seed()
  }
}

function save(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    return
  }
}

interface ConsentState extends Persisted {
  decide: (id: string, status: 'Approved' | 'Refused') => void
  revoke: (id: string) => void
  request: (r: Omit<VerificationRequest, 'id' | 'createdAt' | 'status'>) => void
  record: (actor: string, action: string) => void
  reset: () => void
}

const pick = (s: ConsentState): Persisted => ({ requests: s.requests, log: s.log, seq: s.seq })

export const useConsent = create<ConsentState>((set, get) => ({
  ...load(),
  decide: (id, status) => {
    const s = get()
    const now = new Date()
    const r = s.requests.find((x) => x.id === id)
    if (!r) return
    const consentNo = status === 'Approved' ? `CN-${s.seq}` : undefined
    const expiresAt = status === 'Approved' ? new Date(now.getTime() + r.validityDays * 86400000).toISOString() : undefined
    const requests = s.requests.map((x) => (x.id === id ? { ...x, status, decidedAt: now.toISOString(), consentNo, expiresAt } : x))
    const log = [{ id: `LG-${Date.now()}`, at: now.toISOString(), actor: 'You', action: status === 'Approved' ? `Allowed ${r.verifierOrg} to verify your degree (${consentNo})` : `Refused the request from ${r.verifierOrg}` }, ...s.log]
    set({ requests, log, seq: status === 'Approved' ? s.seq + 1 : s.seq })
    save(pick(get()))
  },
  revoke: (id) => {
    const s = get()
    const r = s.requests.find((x) => x.id === id)
    if (!r) return
    const requests = s.requests.map((x) => (x.id === id ? { ...x, status: 'Revoked' as const, decidedAt: new Date().toISOString() } : x))
    const log = [{ id: `LG-${Date.now()}`, at: new Date().toISOString(), actor: 'You', action: `Revoked consent ${r.consentNo} for ${r.verifierOrg}` }, ...s.log]
    set({ requests, log })
    save(pick(get()))
  },
  request: (r) => {
    const s = get()
    const now = new Date().toISOString()
    const req: VerificationRequest = { ...r, id: `RQ-${Date.now()}`, createdAt: now, status: 'Pending' }
    set({ requests: [req, ...s.requests], log: [{ id: `LG-${Date.now()}`, at: now, actor: r.verifierOrg, action: 'Requested to verify your degree' }, ...s.log] })
    save(pick(get()))
  },
  record: (actor, action) => {
    const s = get()
    set({ log: [{ id: `LG-${Date.now()}-${Math.random()}`, at: new Date().toISOString(), actor, action }, ...s.log] })
    save(pick(get()))
  },
  reset: () => {
    const p = seed()
    set(p)
    save(p)
  },
}))

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) useConsent.setState(load())
  })
}

export function activeConsent(requests: VerificationRequest[], apaar: string, org: string) {
  const now = Date.now()
  return requests.find((r) => r.apaar === apaar && r.verifierOrg === org && r.status === 'Approved' && r.expiresAt && new Date(r.expiresAt).getTime() > now)
}
