import { and, desc, eq, lt, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accessLog, verificationRequests } from '../db/schema'

export type Request = typeof verificationRequests.$inferSelect

/** Approved consents past their expiry flip to Expired (and are logged) before anyone reads them. */
export async function expireStale(db: Db) {
  const now = new Date().toISOString()
  const expired = await db.update(verificationRequests)
    .set({ status: 'Expired' })
    .where(and(eq(verificationRequests.status, 'Approved'), lt(verificationRequests.expiresAt, now)))
    .returning()
  if (expired.length) {
    await db.insert(accessLog).values(expired.map((r) => ({
      apaar: r.apaar, at: r.expiresAt ?? now, actor: 'APAAR-Sathi', action: `Consent ${r.consentNo} for ${r.verifierOrg} expired`,
    })))
  }
}

export const toClient = (r: Request) => ({
  id: r.id, apaar: r.apaar, verifier: r.verifier, verifierOrg: r.verifierOrg, purpose: r.purpose, reference: r.reference,
  validityDays: r.validityDays, retentionDays: r.retentionDays, fields: r.fields, createdAt: r.createdAt, status: r.status,
  decidedAt: r.decidedAt ?? undefined, consentNo: r.consentNo ?? undefined, expiresAt: r.expiresAt ?? undefined,
  ...retention(r),
})

/**
 * DPDP Act s.8(7): the verifier must erase what it received once consent is withdrawn or the purpose is served.
 * The clock starts at the first view: erase by first view + retentionDays, or at once when consent is revoked.
 */
export function retention(r: Request) {
  if (!r.firstViewedAt) return {}
  const eraseBy = r.eraseBy ?? new Date(Date.parse(r.firstViewedAt) + r.retentionDays * 86400000).toISOString()
  return {
    firstViewedAt: r.firstViewedAt, eraseBy, erasedAt: r.erasedAt ?? undefined,
    eraseOverdue: !r.erasedAt && Date.parse(eraseBy) < Date.now(),
  }
}

export async function activeConsent(db: Db, apaar: string, org: string) {
  await expireStale(db)
  const [r] = await db.select().from(verificationRequests)
    .where(and(
      eq(verificationRequests.apaar, apaar), eq(verificationRequests.verifierOrg, org),
      eq(verificationRequests.status, 'Approved'), sql`${verificationRequests.expiresAt} > now()`,
    ))
    .orderBy(desc(verificationRequests.decidedAt)).limit(1)
  return r ?? null
}

export async function log(db: Db | Parameters<Parameters<Db['transaction']>[0]>[0], apaar: string, actor: string, action: string) {
  await db.insert(accessLog).values({ apaar, actor, action, at: new Date().toISOString() })
}
