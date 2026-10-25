import { createHash } from 'node:crypto'
import { asc, desc, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { auditLog } from '../db/schema'
import type { SessionUser } from './auth'

export const GENESIS = '0'.repeat(64)
const LOCK_KEY = 26263

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Exec = Db | Tx

export interface AuditInput {
  action: string
  entity: string
  entityId: string
  payload?: Record<string, unknown>
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
}

export function entryHash(prevHash: string, e: { at: string; actor: string; role: string; action: string; entity: string; entityId: string; payload: unknown }) {
  return createHash('sha256')
    .update(prevHash)
    .update(canonical({ at: e.at, actor: e.actor, role: e.role, action: e.action, entity: e.entity, entityId: e.entityId, payload: e.payload }))
    .digest('hex')
}

/** Append to the hash-chained audit log. Serialised with an advisory lock so the chain never forks. */
export async function audit(db: Exec, who: Pick<SessionUser, 'userId' | 'role'>, input: AuditInput) {
  const write = async (tx: Exec) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`)
    const [last] = await tx.select({ hash: auditLog.hash }).from(auditLog).orderBy(desc(auditLog.seq)).limit(1)
    const prevHash = last?.hash ?? GENESIS
    const at = new Date().toISOString()
    const payload = input.payload ?? {}
    const hash = entryHash(prevHash, { at, actor: who.userId, role: who.role, action: input.action, entity: input.entity, entityId: input.entityId, payload })
    await tx.insert(auditLog).values({ at, actor: who.userId, role: who.role, action: input.action, entity: input.entity, entityId: input.entityId, payload, prevHash, hash })
  }
  if ('rollback' in db) return write(db)
  return (db as Db).transaction(write)
}

export async function verifyChain(db: Db) {
  const rows = await db.select().from(auditLog).orderBy(asc(auditLog.seq))
  let prev = GENESIS
  for (const r of rows) {
    const expected = entryHash(prev, { ...r, at: new Date(r.at).toISOString() })
    if (r.prevHash !== prev || r.hash !== expected) return { ok: false as const, entries: rows.length, brokenAt: r.seq }
    prev = r.hash
  }
  return { ok: true as const, entries: rows.length, head: prev }
}
