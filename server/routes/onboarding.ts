import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { AICTE_DOMAIN, domainOf } from '../../src/auth/directory'
import { apaarRegistry, registrations, users } from '../db/schema'
import { audit, maskApaar } from '../lib/audit'
import { requireRole } from '../lib/auth'
import { conflict, handler, notFound, parse } from '../lib/http'
import { maskMobile } from '../services/otp'

const Decision = z.object({ decision: z.enum(['Approved', 'Rejected']), note: z.string().trim().max(500).default('') })

/** One-time password for a new account: shown once to the approver, stored only as a bcrypt hash, must be changed at first sign-in. */
export function tempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = randomBytes(10)
  return `${[...bytes].map((b) => alphabet[b % alphabet.length]).join('')}#7`
}

const toClient = (r: typeof registrations.$inferSelect) => ({
  ref: r.ref, kind: r.kind, status: r.status, createdAt: r.createdAt,
  ...(r.kind === 'student' ? { apaar: r.apaar, mobile: maskMobile(r.mobile) } : { org: r.org, email: r.email, purpose: r.purpose }),
  decidedAt: r.decidedAt ?? undefined, decidedBy: r.decidedBy ?? undefined, decisionNote: r.decisionNote ?? undefined, userId: r.userId ?? undefined,
})

/** AICTE administrators review sign-up requests from students and verifier organisations. */
export function onboardingRoutes() {
  const r = Router()
  r.use(requireRole('aicte_admin'))

  r.get('/', handler(async (req, res) => {
    const rows = await req.db.select().from(registrations).orderBy(desc(registrations.createdAt))
    res.json(rows.map(toClient))
  }))

  r.post('/:ref/decide', handler(async (req, res) => {
    const b = parse(Decision, req.body)
    const reg = await req.db.query.registrations.findFirst({ where: eq(registrations.ref, req.params.ref) })
    if (!reg) throw notFound('No such registration')
    if (reg.status !== 'Received') throw conflict('already_decided', `This request was already ${reg.status.toLowerCase()}`)

    let account: { userId: string; name: string; role: string; org: string; mobile: string | null } | null = null
    if (b.decision === 'Approved') {
      if (reg.kind === 'student') {
        const person = await req.db.query.apaarRegistry.findFirst({ where: eq(apaarRegistry.apaar, reg.apaar!) })
        if (!person) throw conflict('apaar_unknown', 'This APAAR ID is not in the registry. Reject the request or ask the student to check it.')
        account = { userId: reg.apaar!, name: person.name, role: 'student', org: 'Student', mobile: reg.mobile }
      } else {
        if (domainOf(reg.email!) === AICTE_DOMAIN) throw conflict('domain_policy', 'Verifier accounts cannot use an AICTE email address')
        account = { userId: reg.email!.toLowerCase(), name: reg.email!.split('@')[0], role: 'verifier', org: reg.org!, mobile: null }
      }
      const existing = await req.db.query.users.findFirst({ where: eq(users.userId, account.userId) })
      if (existing) throw conflict('account_exists', `An account ${account.userId} already exists`)
    }

    const password = account ? tempPassword() : null
    const updated = await req.db.transaction(async (tx) => {
      if (account && password) {
        await tx.insert(users).values({
          userId: account.userId, name: account.name, role: account.role, org: account.org,
          scope: account.role === 'student' ? `APAAR ${maskApaar(account.userId)}` : 'Consent-based degree verification',
          apaar: account.role === 'student' ? account.userId : null, mobile: account.mobile,
          passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true,
        })
      }
      const [u] = await tx.update(registrations).set({
        status: b.decision, decidedAt: new Date().toISOString(), decidedBy: req.user!.userId, decisionNote: b.note, userId: account?.userId ?? null,
      }).where(eq(registrations.ref, reg.ref)).returning()
      await audit(tx, req.user!, {
        category: 'Registration', action: b.decision === 'Approved' ? 'Registration approved' : 'Registration rejected',
        detail: `${reg.ref}${account ? `, account ${account.role === 'student' ? maskApaar(account.userId) : account.userId} created` : ''}${b.note ? `, ${b.note}` : ''}`,
        entity: 'registration', entityId: reg.ref,
      })
      return u
    })
    // In production the password goes by SMS or email. There is no gateway in this build, so it is shown once here.
    res.json({ registration: toClient(updated), ...(password ? { tempPassword: password } : {}) })
  }))

  return r
}
