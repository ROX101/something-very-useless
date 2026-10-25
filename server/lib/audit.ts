import { createHash } from 'node:crypto'
import { asc, desc, sql } from 'drizzle-orm'
import { ROLE_LABEL, type Role } from '../../src/auth/directory'
import type { Db } from '../db/client'
import { auditLog } from '../db/schema'
import type { SessionUser } from './auth'

export const GENESIS = '0'.repeat(64)
const LOCK_KEY = 26263

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Exec = Db | Tx

export const CATEGORIES = ['Sign-in', 'Data', 'Submission', 'Compliance', 'Consent', 'Verification', 'Reports', 'Registration', 'Administration', 'System'] as const
export type Category = (typeof CATEGORIES)[number]

/** Who an entry is attributed to. Signed-in users come from the session; the public is "Public". */
export interface Who { userId: string; role: Role | 'public'; name: string; org: string }

export const asWho = (u: SessionUser): Who => ({ userId: u.userId, role: u.role, name: u.name, org: u.org })
export const PUBLIC: Who = { userId: 'public', role: 'public', name: 'Public', org: '' }

export interface AuditInput {
  category: Category
  /** Human-readable event, e.g. "Submitted enrolment data to AICTE". */
  action: string
  /** Human-readable details, e.g. "Receipt AS-26-0417-0091, 507 records". */
  detail: string
  /** For filtering only, not part of the hash. */
  entity?: string
  entityId?: string
}

export interface TrailEntry {
  seq: number; at: string; actor: string; role: string; org: string
  category: string; action: string; detail: string; prev: string; hash: string
}

/** Identical to the browser's canonical() in src/audit/log.ts, so either side can verify the chain. */
export function canonical(e: Omit<TrailEntry, 'hash'>) {
  return [e.seq, e.at, e.actor, e.role, e.org, e.category, e.action, e.detail, e.prev].join('|')
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const roleLabel = (r: Who['role']) => (r === 'public' ? 'Public' : ROLE_LABEL[r])

/**
 * Appends to the hash-chained audit trail inside the caller's transaction (or a new one).
 * An advisory lock serialises writers, and seq is assigned here rather than by a sequence,
 * so a rolled-back transaction can never leave a gap in the chain.
 */
export async function audit(db: Exec, who: Who | SessionUser, input: AuditInput) {
  const w: Who = 'states' in who ? asWho(who) : who
  const write = async (tx: Exec) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`)
    const [last] = await tx.select({ seq: auditLog.seq, hash: auditLog.hash }).from(auditLog).orderBy(desc(auditLog.seq)).limit(1)
    const base = {
      seq: (last?.seq ?? 0) + 1,
      at: new Date().toISOString(),
      actor: w.name,
      role: roleLabel(w.role),
      org: w.org,
      category: input.category,
      action: input.action,
      detail: input.detail,
      prev: last?.hash ?? GENESIS,
    }
    await tx.insert(auditLog).values({
      seq: base.seq, at: base.at, actor: w.userId, role: w.role, actorName: base.actor, roleLabel: base.role, org: base.org,
      category: base.category, action: base.action, detail: base.detail,
      entity: input.entity ?? input.category.toLowerCase(), entityId: input.entityId ?? '',
      prevHash: base.prev, hash: sha(canonical(base)),
    })
  }
  if ('rollback' in db) return write(db)
  return (db as Db).transaction(write)
}

export const toTrail = (r: typeof auditLog.$inferSelect): TrailEntry => ({
  seq: r.seq, at: new Date(r.at).toISOString(), actor: r.actorName, role: r.roleLabel, org: r.org,
  category: r.category, action: r.action, detail: r.detail, prev: r.prevHash, hash: r.hash,
})

export async function verifyChain(db: Db) {
  const rows = (await db.select().from(auditLog).orderBy(asc(auditLog.seq))).map(toTrail)
  let prev = GENESIS
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.seq !== i + 1 || r.prev !== prev || r.hash !== sha(canonical(r))) return { ok: false as const, entries: rows.length, brokenAt: r.seq }
    prev = r.hash
  }
  return { ok: true as const, entries: rows.length, head: prev }
}

/** Masks an APAAR ID for logs: 4471 •••• ••18 */
export const maskApaar = (a: string) => `${a.slice(0, 4)} •••• ••${a.slice(-2)}`
