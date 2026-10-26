import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { AICTE_DOMAIN, AICTE_ROLES, domainOf, normaliseUserId } from '../../src/auth/directory'
import { users } from '../db/schema'
import { PUBLIC, audit } from '../lib/audit'
import { clearSessionCookie, issueToken, publicAccount, requireAuth, setSessionCookie, toSessionUser } from '../lib/auth'
import { HttpError, handler, parse } from '../lib/http'

const Login = z.object({ userId: z.string().min(1).max(200), password: z.string().min(1).max(200) })
const ChangePassword = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(10, 'Use at least 10 characters').max(200)
    .regex(/[A-Za-z]/, 'Include a letter').regex(/\d/, 'Include a number'),
})

// Precomputed hash so unknown users take as long as known ones (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

export function authRoutes({ loginLimit = 20 } = {}) {
  const r = Router()

  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: loginLimit, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many sign-in attempts. Try again in 15 minutes.' } })

  r.post('/login', limiter, handler(async (req, res) => {
    const body = parse(Login, req.body)
    const userId = normaliseUserId(body.userId)
    const u = await req.db.query.users.findFirst({ where: eq(users.userId, userId) })

    const ok = await bcrypt.compare(body.password, u?.passwordHash ?? DUMMY_HASH)
    const fail = async (why: string) => audit(req.db, PUBLIC, { category: 'Sign-in', action: 'Sign-in failed', detail: `${userId}: ${why}`, entity: 'user', entityId: userId })
    if (!u || !u.active) { await fail('unknown user ID'); throw new HttpError(401, 'not_found', 'No account found with this user ID') }
    if (!ok) { await fail('wrong password'); throw new HttpError(401, 'bad_password', 'Incorrect password') }

    const isAicteDomain = domainOf(userId) === AICTE_DOMAIN
    const isAicteRole = (AICTE_ROLES as string[]).includes(u.role)
    if (isAicteDomain !== isAicteRole) { await fail('domain not allowed for this role'); throw new HttpError(403, 'domain_policy', 'AICTE roles are limited to @aicte-india.org accounts') }

    const session = toSessionUser(u)
    setSessionCookie(res, await issueToken(session))
    await req.db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.userId, userId))
    await audit(req.db, session, { category: 'Sign-in', action: 'Signed in', detail: userId, entity: 'user', entityId: userId })
    res.json({ account: publicAccount(session) })
  }))

  r.post('/logout', handler(async (req, res) => {
    if (req.user) await audit(req.db, req.user, { category: 'Sign-in', action: 'Signed out', detail: req.user.userId, entity: 'user', entityId: req.user.userId })
    clearSessionCookie(res)
    res.status(204).end()
  }))

  r.post('/password', requireAuth, limiter, handler(async (req, res) => {
    const b = parse(ChangePassword, req.body)
    const u = await req.db.query.users.findFirst({ where: eq(users.userId, req.user!.userId) })
    if (!u || !(await bcrypt.compare(b.current, u.passwordHash))) throw new HttpError(400, 'bad_password', 'Your current password is incorrect')
    if (b.current === b.next) throw new HttpError(400, 'same_password', 'Choose a password different from the current one')
    const [updated] = await req.db.update(users).set({ passwordHash: await bcrypt.hash(b.next, 10), mustChangePassword: false }).where(eq(users.userId, u.userId)).returning()
    await audit(req.db, req.user!, { category: 'Sign-in', action: 'Changed password', detail: u.userId, entity: 'user', entityId: u.userId })
    const session = toSessionUser(updated)
    setSessionCookie(res, await issueToken(session))
    res.json({ account: publicAccount(session) })
  }))

  r.get('/me', requireAuth, (req, res) => {
    res.json({ account: publicAccount(req.user!) })
  })

  return r
}
