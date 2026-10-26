import type { NextFunction, Request, Response } from 'express'
import { SignJWT, jwtVerify } from 'jose'
import { eq } from 'drizzle-orm'
import type { Role } from '../../src/auth/directory'
import type { Db } from '../db/client'
import { users } from '../db/schema'
import { env } from '../env'
import { HttpError, forbidden } from './http'

export const COOKIE = 'as_session'
const key = new TextEncoder().encode(env.jwtSecret)

export interface SessionUser {
  userId: string
  name: string
  role: Role
  org: string
  scope: string
  institutionPid: string | null
  apaar: string | null
  states: string[]
  issuerDid: string | null
  mustChangePassword?: boolean
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser
      db: Db
    }
  }
}

export async function issueToken(user: SessionUser) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${env.sessionHours}h`)
    .sign(key)
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: env.sessionHours * 3600 * 1000,
    path: '/',
  })
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { path: '/' })
}

export function toSessionUser(u: typeof users.$inferSelect): SessionUser {
  return {
    userId: u.userId, name: u.name, role: u.role as Role, org: u.org, scope: u.scope,
    institutionPid: u.institutionPid, apaar: u.apaar, states: u.states, issuerDid: u.issuerDid,
    mustChangePassword: u.mustChangePassword,
  }
}

/** Public shape returned to the browser (matches src/auth/directory Account). */
export const publicAccount = (u: SessionUser) => ({ userId: u.userId, name: u.name, role: u.role, org: u.org, scope: u.scope, ...(u.mustChangePassword ? { mustChangePassword: true } : {}) })

export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE] ?? bearer(req)
  if (!token) return next()
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
    if (payload.sub) {
      const u = await req.db.query.users.findFirst({ where: eq(users.userId, payload.sub) })
      if (u?.active) req.user = toSessionUser(u)
    }
  } catch {
    // invalid or expired token: treat as signed out
  }
  next()
}

function bearer(req: Request) {
  const h = req.headers.authorization
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'unauthenticated', 'Please sign in'))
  next()
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, 'unauthenticated', 'Please sign in'))
  if (!roles.includes(req.user.role)) return next(forbidden())
  next()
}
