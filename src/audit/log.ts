import { create } from 'zustand'
import { subscribe } from '../sync'
import { useApp } from '../store'
import { ROLE_LABEL, type Account } from '../auth/directory'

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

export const useAudit = create<{ entries: AuditEntry[] }>(() => ({ entries: [] }))

if (typeof window !== 'undefined') {
  subscribe('as.audit', (v) => { if (Array.isArray(v)) useAudit.setState({ entries: v as AuditEntry[] }) })
}

export function audit(category: AuditCategory, action: string, detail: string, who?: Account | { name: string; role: string; org: string }) {
  const a = who ?? useApp.getState().account
  const actor = a ? a.name : 'Public'
  const role = a ? ('userId' in a ? ROLE_LABEL[(a as Account).role] : a.role) : 'Public'
  const org = a ? a.org : ''
  void fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor, role, org, category, action, detail }),
  }).catch(() => undefined)
}

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
