import { Router } from 'express'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { accessLog, apaarRegistry, credentials, verificationRequests } from '../db/schema'
import { audit } from '../lib/audit'
import { requireRole } from '../lib/auth'
import { next } from '../lib/counters'
import { conflict, forbidden, handler, notFound, parse } from '../lib/http'
import { expireStale, log, toClient } from '../services/consent'

const Decide = z.object({ status: z.enum(['Approved', 'Refused']) })

export function studentRoutes() {
  const r = Router()
  r.use(requireRole('student'))
  r.use((req, _res, nxt) => (req.user!.apaar ? nxt() : nxt(forbidden('Account is not linked to an APAAR ID'))))
  const apaarOf = (req: Express.Request) => req.user!.apaar!

  async function ownRequest(req: Express.Request, id: string) {
    const row = await req.db.query.verificationRequests.findFirst({ where: and(eq(verificationRequests.id, id), eq(verificationRequests.apaar, apaarOf(req))) })
    if (!row) throw notFound('No such request')
    return row
  }

  r.get('/record', handler(async (req, res) => {
    const apaar = apaarOf(req)
    const [reg, certs] = await Promise.all([
      req.db.query.apaarRegistry.findFirst({ where: eq(apaarRegistry.apaar, apaar) }),
      req.db.select({ certNo: credentials.certNo, issuedAt: credentials.issuedAt, revoked: credentials.revoked }).from(credentials).where(eq(credentials.apaar, apaar)),
    ])
    res.json({ apaar, name: reg?.name ?? req.user!.name, gender: reg?.gender, credentials: certs })
  }))

  r.get('/requests', handler(async (req, res) => {
    await expireStale(req.db)
    const rows = await req.db.select().from(verificationRequests).where(eq(verificationRequests.apaar, apaarOf(req))).orderBy(desc(verificationRequests.createdAt))
    res.json(rows.map(toClient))
  }))

  r.post('/requests/:id/decide', handler(async (req, res) => {
    const { status } = parse(Decide, req.body)
    const row = await ownRequest(req, req.params.id)
    if (row.status !== 'Pending') throw conflict('not_pending', `This request is already ${row.status.toLowerCase()}`)
    const updated = await req.db.transaction(async (tx) => {
      const now = new Date()
      const consentNo = status === 'Approved' ? `CN-${await next(tx, 'consent', 7731)}` : null
      const expiresAt = status === 'Approved' ? new Date(now.getTime() + row.validityDays * 86400000).toISOString() : null
      const [u] = await tx.update(verificationRequests)
        .set({ status, decidedAt: now.toISOString(), consentNo, expiresAt })
        .where(eq(verificationRequests.id, row.id)).returning()
      await log(tx, row.apaar, 'You', status === 'Approved'
        ? `Allowed ${row.verifierOrg} to verify your degree (${consentNo})`
        : `Refused the request from ${row.verifierOrg}`)
      await audit(tx, req.user!, {
        category: 'Consent', action: status === 'Approved' ? 'Allowed verification' : 'Refused verification',
        detail: `${row.verifierOrg}, ${row.purpose}${consentNo ? `, ${consentNo} valid ${row.validityDays} days` : ''}`,
        entity: 'verification_request', entityId: row.id,
      })
      return u
    })
    res.json(toClient(updated))
  }))

  // DPDP Act 2023, s. 6(4): withdrawing consent must be as easy as giving it.
  r.post('/requests/:id/revoke', handler(async (req, res) => {
    const row = await ownRequest(req, req.params.id)
    if (row.status !== 'Approved') throw conflict('not_active', 'Only an active consent can be revoked')
    const updated = await req.db.transaction(async (tx) => {
      const [u] = await tx.update(verificationRequests)
        .set({ status: 'Revoked', decidedAt: new Date().toISOString() })
        .where(eq(verificationRequests.id, row.id)).returning()
      await log(tx, row.apaar, 'You', `Revoked consent ${row.consentNo} for ${row.verifierOrg}`)
      await audit(tx, req.user!, { category: 'Consent', action: 'Revoked consent', detail: `${row.consentNo}, ${row.verifierOrg}`, entity: 'verification_request', entityId: row.id })
      return u
    })
    res.json(toClient(updated))
  }))

  r.get('/log', handler(async (req, res) => {
    const rows = await req.db.select().from(accessLog).where(eq(accessLog.apaar, apaarOf(req))).orderBy(desc(accessLog.at), desc(accessLog.id)).limit(500)
    res.json(rows.map((l) => ({ id: `LG-${l.id}`, at: new Date(l.at).toISOString(), actor: l.actor, action: l.action })))
  }))

  return r
}
