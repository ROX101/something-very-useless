import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { apiKeys } from '../db/schema'
import { HttpError } from './http'

/**
 * Key format: apaar_<id>_<secret>. The id is public (shown in the portal and logs); only a SHA-256
 * of the secret is stored, so a database leak does not leak working keys.
 */
const PREFIX = 'apaar_'
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export interface ApiClient {
  keyId: string
  scope: 'institution' | 'aicte'
  institutionPid: string | null
  name: string
  /** The officer who created the key; uploads made with it are recorded under this user. */
  createdBy: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { client?: ApiClient }
  }
}

export async function createKey(db: Db, input: { scope: 'institution' | 'aicte'; institutionPid?: string | null; name: string; createdBy: string }) {
  const id = randomBytes(6).toString('hex')
  const secret = randomBytes(24).toString('base64url')
  await db.insert(apiKeys).values({
    id, scope: input.scope, institutionPid: input.institutionPid ?? null, name: input.name,
    secretHash: sha(secret), createdBy: input.createdBy,
  })
  return { id, key: `${PREFIX}${id}_${secret}` }
}

function readKey(req: Request) {
  const h = req.headers.authorization
  if (h?.startsWith('Bearer ' + PREFIX)) return h.slice(7)
  const x = req.headers['x-api-key']
  return typeof x === 'string' && x.startsWith(PREFIX) ? x : undefined
}

/** Authenticates a machine client by API key. Sends 401 for a missing, malformed, unknown or revoked key. */
export async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = readKey(req)
    if (!raw) throw new HttpError(401, 'api_key_required', 'Send your API key as "Authorization: Bearer apaar_…" or in X-API-Key')
    const m = /^apaar_([0-9a-f]{12})_([A-Za-z0-9_-]{20,})$/.exec(raw)
    if (!m) throw new HttpError(401, 'invalid_api_key', 'Malformed API key')
    const row = await req.db.query.apiKeys.findFirst({ where: eq(apiKeys.id, m[1]) })
    const ok = row && timingSafeEqual(Buffer.from(row.secretHash), Buffer.from(sha(m[2])))
    if (!row || !ok) throw new HttpError(401, 'invalid_api_key', 'Unknown API key')
    if (row.revokedAt) throw new HttpError(401, 'revoked_api_key', 'This API key has been revoked')
    req.client = { keyId: row.id, scope: row.scope as ApiClient['scope'], institutionPid: row.institutionPid, name: row.name, createdBy: row.createdBy }
    void req.db.update(apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiKeys.id, row.id)).catch(() => undefined)
    next()
  } catch (e) {
    next(e)
  }
}

export const toPublicKey = (k: typeof apiKeys.$inferSelect) => ({
  id: k.id, name: k.name, scope: k.scope, institutionPid: k.institutionPid, createdBy: k.createdBy,
  createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt,
})
