import { createHash, randomInt } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { otps } from '../db/schema'
import { env } from '../env'
import { HttpError } from '../lib/http'

export const OTP_TTL_MS = 5 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5
type Tx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

const digest = (userId: string, purpose: string, code: string) => createHash('sha256').update(`${userId}|${purpose}|${code}`).digest('hex')

/** Masks a 10-digit mobile as +91 ••••• ••321. */
export const maskMobile = (m: string | null | undefined) => (m ? `+91 ••••• ••${m.slice(-3)}` : null)

/**
 * Issues a 6-digit one-time password for one purpose (for example consent:RQ-1001). Earlier codes for the same
 * purpose stop working. Only a hash is kept. There is no SMS gateway in this build: with OTP_DEMO on, the code is
 * returned to the caller so the demo can show it; with it off, the code would go to the SMS provider only.
 */
export async function issueOtp(db: Tx, userId: string, purpose: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const now = Date.now()
  await db.update(otps).set({ usedAt: new Date(now).toISOString() })
    .where(and(eq(otps.userId, userId), eq(otps.purpose, purpose), isNull(otps.usedAt)))
  const expiresAt = new Date(now + OTP_TTL_MS).toISOString()
  await db.insert(otps).values({ userId, purpose, codeHash: digest(userId, purpose, code), expiresAt })
  return { expiresAt, ...(env.otpDemo ? { demoCode: code } : {}) }
}

/** Checks and consumes a code. Throws 400 with a reason the user can act on. */
export async function verifyOtp(db: Tx, userId: string, purpose: string, code: string | undefined) {
  if (!code || !/^\d{6}$/.test(code)) throw new HttpError(400, 'otp_required', 'Enter the 6-digit code sent to your mobile')
  const [row] = await db.select().from(otps)
    .where(and(eq(otps.userId, userId), eq(otps.purpose, purpose), isNull(otps.usedAt)))
    .orderBy(otps.id).limit(1)
  if (!row) throw new HttpError(400, 'otp_missing', 'Request a new code first')
  if (Date.parse(row.expiresAt) < Date.now()) {
    await db.update(otps).set({ usedAt: new Date().toISOString() }).where(eq(otps.id, row.id))
    throw new HttpError(400, 'otp_expired', 'This code has expired. Request a new one.')
  }
  if (row.codeHash !== digest(userId, purpose, code)) {
    const attempts = row.attempts + 1
    await db.update(otps).set({ attempts, ...(attempts >= OTP_MAX_ATTEMPTS ? { usedAt: new Date().toISOString() } : {}) }).where(eq(otps.id, row.id))
    throw new HttpError(400, 'otp_wrong', attempts >= OTP_MAX_ATTEMPTS ? 'Too many wrong attempts. Request a new code.' : `Incorrect code. ${OTP_MAX_ATTEMPTS - attempts} attempts left.`)
  }
  await db.update(otps).set({ usedAt: new Date().toISOString() }).where(eq(otps.id, row.id))
}
