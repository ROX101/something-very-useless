import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { AICTE_DOMAIN, AICTE_ROLES, domainOf, normaliseUserId } from '../../src/auth/directory'
import { users } from '../db/schema'
import { audit } from '../lib/audit'
import { clearSessionCookie, issueToken, publicAccount, requireAuth, setSessionCookie, toSessionUser } from '../lib/auth'
import { HttpError, handler, parse } from '../lib/http'

const Login = z.object({ userId: z.string().min(1).max(200), password: z.string().min(1).max(200) })

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
    if (!u || !u.active) throw new HttpError(401, 'not_found', 'No account found with this user ID')
    if (!ok) throw new HttpError(401, 'bad_password', 'Incorrect password')

    const isAicteDomain = domainOf(userId) === AICTE_DOMAIN
    const isAicteRole = (AICTE_ROLES as string[]).includes(u.role)
    if (isAicteDomain !== isAicteRole) throw new HttpError(403, 'domain_policy', 'AICTE roles are limited to @aicte-india.org accounts')

    const session = toSessionUser(u)
    setSessionCookie(res, await issueToken(session))
    await req.db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.userId, userId))
    await audit(req.db, session, { action: 'auth.login', entity: 'user', entityId: userId })
    res.json({ account: publicAccount(session) })
  }))

  r.post('/logout', handler(async (req, res) => {
    if (req.user) await audit(req.db, req.user, { action: 'auth.logout', entity: 'user', entityId: req.user.userId })
    clearSessionCookie(res)
    res.status(204).end()
  }))

  r.get('/me', requireAuth, (req, res) => {
    res.json({ account: publicAccount(req.user!) })
  })

  return r
}
