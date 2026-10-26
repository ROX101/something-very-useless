import { Router } from 'express'
import { and, desc, eq } from 'drizzle-orm'
import { decodeJwt } from 'jose'
import { z } from 'zod'
import { apaarRegistry, credentials, verificationRequests } from '../db/schema'
import { audit, maskApaar } from '../lib/audit'
import { requireRole } from '../lib/auth'
import { next } from '../lib/counters'
import { badRequest, conflict, handler, notFound, parse } from '../lib/http'
import { activeConsent, expireStale, log, retention, toClient } from '../services/consent'

const NewRequest = z.object({
  apaar: z.string().transform((s) => s.replace(/\s/g, '')).pipe(z.string().regex(/^\d{12}$/, 'Enter a 12-digit APAAR ID')),
  purpose: z.string().min(3).max(200),
  reference: z.string().max(200).default(''),
  validityDays: z.number().int().min(1).max(90),
  retentionDays: z.number().int().min(1).max(3650).default(30),
  /** 'basic' is always shared; 'marks' (CGPA, division) only if the student agrees. */
  fields: z.array(z.enum(['basic', 'marks'])).default(['basic']).transform((f) => [...new Set(['basic', ...f])]),
})

interface Subject { name?: string; degree?: string; year?: number; cgpa?: string; div?: string }

export function verifierRoutes() {
  const r = Router()
  r.use(requireRole('verifier'))

  r.get('/requests', handler(async (req, res) => {
    await expireStale(req.db)
    const rows = await req.db.select().from(verificationRequests).where(eq(verificationRequests.verifierOrg, req.user!.org)).orderBy(desc(verificationRequests.createdAt))
    res.json(rows.map(toClient))
  }))

  r.post('/requests', handler(async (req, res) => {
    const body = parse(NewRequest, req.body)
    const student = await req.db.query.apaarRegistry.findFirst({ where: eq(apaarRegistry.apaar, body.apaar) })
    if (!student) throw notFound('No student found with this APAAR ID')
    const pending = await req.db.query.verificationRequests.findFirst({
      where: and(eq(verificationRequests.apaar, body.apaar), eq(verificationRequests.verifierOrg, req.user!.org), eq(verificationRequests.status, 'Pending')),
    })
    if (pending) throw conflict('already_pending', 'A request to this student is already waiting for a decision')

    const created = await req.db.transaction(async (tx) => {
      const id = `RQ-${await next(tx, 'request', 1001)}`
      const [row] = await tx.insert(verificationRequests).values({
        id, apaar: body.apaar, verifierUserId: req.user!.userId, verifier: req.user!.name, verifierOrg: req.user!.org,
        purpose: body.purpose, reference: body.reference, validityDays: body.validityDays, retentionDays: body.retentionDays, fields: body.fields,
      }).returning()
      await log(tx, body.apaar, req.user!.org, 'Requested to verify your degree')
      await audit(tx, req.user!, {
        category: 'Consent', action: 'Requested consent',
        detail: `APAAR ${maskApaar(body.apaar)}, ${body.purpose}${body.reference ? `, ${body.reference}` : ''}`,
        entity: 'verification_request', entityId: id,
      })
      return row
    })
    res.status(201).json(toClient(created))
  }))

  /** Consent-gated read. Returns only the shared fields, and every read is written to the student's access log. */
  r.get('/records/:apaar', handler(async (req, res) => {
    const apaar = req.params.apaar.replace(/\s/g, '')
    if (!/^\d{12}$/.test(apaar)) throw badRequest('invalid_apaar', 'Enter a 12-digit APAAR ID')
    const consent = await activeConsent(req.db, apaar, req.user!.org)
    if (!consent) {
      res.status(403).json({ error: 'no_consent', message: 'The student has not allowed your organisation to see the details' })
      return
    }
    const [cred] = await req.db.select().from(credentials).where(eq(credentials.apaar, apaar)).orderBy(desc(credentials.issuedAt)).limit(1)
    const reg = await req.db.query.apaarRegistry.findFirst({ where: eq(apaarRegistry.apaar, apaar) })
    const subject = cred ? ((decodeJwt(cred.jws).vc as { credentialSubject?: Subject } | undefined)?.credentialSubject ?? {}) : {}
    const marks = consent.fields.includes('marks')

    if (!consent.firstViewedAt) {
      const now = new Date()
      await req.db.update(verificationRequests).set({ firstViewedAt: now.toISOString(), eraseBy: new Date(now.getTime() + consent.retentionDays * 86400000).toISOString() })
        .where(eq(verificationRequests.id, consent.id))
    }
    await log(req.db, apaar, req.user!.org, `Viewed your degree status (${consent.consentNo})`)
    await audit(req.db, req.user!, { category: 'Verification', action: 'Viewed shared record', detail: `APAAR ${maskApaar(apaar)} under consent ${consent.consentNo}`, entity: 'student', entityId: apaar })

    res.json({
      consentNo: consent.consentNo,
      expiresAt: consent.expiresAt,
      name: subject.name ?? reg?.name,
      degree: subject.degree ?? null,
      year: subject.year ?? null,
      status: cred ? (cred.revoked ? 'Revoked' : 'Awarded') : 'No degree on record',
      ...(marks && cred ? { cgpa: cred.cgpa ?? subject.cgpa ?? null, division: cred.division ?? subject.div ?? null } : {}),
      fields: consent.fields,
      certNo: cred?.certNo ?? null,
    })
  }))

  /** The verifier confirms it has erased the data it received (DPDP s.8(7)). Shown to the student. */
  r.post('/requests/:id/erased', handler(async (req, res) => {
    const row = await req.db.query.verificationRequests.findFirst({ where: and(eq(verificationRequests.id, req.params.id), eq(verificationRequests.verifierOrg, req.user!.org)) })
    if (!row) throw notFound('No such request')
    if (!row.firstViewedAt) throw conflict('not_viewed', 'Nothing was received under this request, so there is nothing to erase')
    if (row.erasedAt) throw conflict('already_erased', 'Erasure was already confirmed')
    const now = new Date().toISOString()
    const [u] = await req.db.transaction(async (tx) => {
      // Erasing ends the purpose, so an active consent ends with it.
      const out = await tx.update(verificationRequests).set({ erasedAt: now, ...(row.status === 'Approved' ? { status: 'Expired' } : {}) }).where(eq(verificationRequests.id, row.id)).returning()
      const overdue = retention(row).eraseOverdue
      await log(tx, row.apaar, req.user!.org, `Confirmed it erased your data received under ${row.consentNo}${overdue ? ' (after the deadline)' : ''}`)
      await audit(tx, req.user!, { category: 'Consent', action: 'Confirmed erasure', detail: `${row.consentNo}, APAAR ${maskApaar(row.apaar)}${overdue ? ', overdue' : ''}`, entity: 'verification_request', entityId: row.id })
      return out
    })
    res.json(toClient(u))
  }))

  return r
}
