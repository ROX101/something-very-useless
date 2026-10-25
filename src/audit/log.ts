import { create } from 'zustand'
import { api } from '../api'
import { onSignOut, useApp } from '../store'

export type AuditCategory = 'Sign-in' | 'Data' | 'Submission' | 'Compliance' | 'Consent' | 'Verification' | 'Reports' | 'Registration' | 'Administration' | 'System'

export interface AuditEntry {
  seq: number
  at: string
  actor: string
  role: string
  org: string
  category: string
  action: string
  detail: string
  prev: string
  hash: string
}

export const GENESIS = '0'.repeat(64)

interface AuditState {
  entries: AuditEntry[]
  loaded: boolean
  error: string | null
  load: () => Promise<void>
}

/** The audit trail as stored on the server (AICTE bureau and IT cell only). */
export const useAudit = create<AuditState>((set) => ({
  entries: [],
  loaded: false,
  error: null,
  load: async () => {
    try {
      set({ entries: await api.get<AuditEntry[]>('/aicte/audit/trail'), loaded: true, error: null })
    } catch (e) {
      set({ loaded: true, error: (e as Error).message })
    }
  },
}))

onSignOut(() => useAudit.setState({ entries: [], loaded: false, error: null }))

/**
 * Records an event that only the browser knows about (a signature checked in the browser, a report exported,
 * a manual entry drafted). Who did it comes from the server session, never from the browser.
 * Everything the server does itself (sign-in, uploads, submissions, consent, case actions) it logs on its own.
 */
export function audit(category: AuditCategory, action: string, detail: string) {
  if (!useApp.getState().account) return
  api.post('/audit', { category, action, detail }).catch(() => undefined)
}

/** Same format the server hashes, so the browser can re-check the chain independently. */
export function canonical(e: Omit<AuditEntry, 'hash'>) {
  return [e.seq, e.at, e.actor, e.role, e.org, e.category, e.action, e.detail, e.prev].join('|')
}

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface ChainCheck { ok: boolean; checked: number; brokenAt?: number; reason?: string }

export async function verifyChain(entries: AuditEntry[]): Promise<ChainCheck> {
  let prev = GENESIS
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (e.seq !== i + 1) return { ok: false, checked: i, brokenAt: e.seq, reason: 'An entry is missing or out of order' }
    if (e.prev !== prev) return { ok: false, checked: i, brokenAt: e.seq, reason: 'The link to the previous entry does not match' }
    const h = await sha256(canonical(e))
    if (h !== e.hash) return { ok: false, checked: i, brokenAt: e.seq, reason: 'The entry was changed after it was recorded' }
    prev = e.hash
  }
  return { ok: true, checked: entries.length }
}
