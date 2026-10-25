import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { credentials, registrations } from '../db/schema'
import { PUBLIC, audit, maskApaar } from '../lib/audit'
import { next } from '../lib/counters'
import { handler, notFound, parse } from '../lib/http'

const Registration = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('student'),
    apaar: z.string().transform((s) => s.replace(/\s/g, '')).pipe(z.string().regex(/^\d{12}$/, 'Enter your 12-digit APAAR ID.')),
    mobile: z.string().transform((s) => s.replace(/\s/g, '')).pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number.')),
  }),
  z.object({
    kind: z.literal('org'),
    org: z.string().trim().min(2).max(200),
    email: z.string().trim().email('Enter a work email like name@company.com.').max(200),
    purpose: z.string().max(200).default(''),
  }),
])

/** Unauthenticated endpoints: certificate lookup, revocation status, and sign-up requests. */
export function publicRoutes() {
  const r = Router()
  r.get('/certificates/:certNo', handler(async (req, res) => {
    const c = await req.db.query.credentials.findFirst({ where: eq(credentials.certNo, req.params.certNo) })
    if (!c) throw notFound('No certificate with this number')
    res.json({ certNo: c.certNo, jws: c.jws, issuedAt: c.issuedAt, revoked: c.revoked, revokedReason: c.revokedReason })
  }))

  const signupLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many sign-up requests from this network. Try again later.' } })

  r.post('/registrations', signupLimit, handler(async (req, res) => {
    const b = parse(Registration, req.body)
    const ref = await req.db.transaction(async (tx) => {
      const ref = `REG-2026-${String(await next(tx, 'registration', 10001)).padStart(5, '0')}`
      if (b.kind === 'student') {
        await tx.insert(registrations).values({ ref, kind: 'student', apaar: b.apaar, mobile: b.mobile })
        await audit(tx, { ...PUBLIC, name: 'Student applicant' }, { category: 'Registration', action: 'Registration request received', detail: `${ref}, student, APAAR ${maskApaar(b.apaar)}`, entity: 'registration', entityId: ref })
      } else {
        await tx.insert(registrations).values({ ref, kind: 'org', org: b.org, email: b.email, purpose: b.purpose })
        await audit(tx, { ...PUBLIC, name: b.email, org: b.org }, { category: 'Registration', action: 'Registration request received', detail: `${ref}, organisation, ${b.purpose}`, entity: 'registration', entityId: ref })
      }
      return ref
    })
    res.status(201).json({ ref })
  }))
  return r
}
