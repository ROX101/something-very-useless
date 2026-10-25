import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { credentials } from '../db/schema'
import { handler, notFound } from '../lib/http'

/** Unauthenticated endpoints: certificate lookup and revocation status for anyone holding a certificate number. */
export function publicRoutes() {
  const r = Router()
  r.get('/certificates/:certNo', handler(async (req, res) => {
    const c = await req.db.query.credentials.findFirst({ where: eq(credentials.certNo, req.params.certNo) })
    if (!c) throw notFound('No certificate with this number')
    res.json({ certNo: c.certNo, jws: c.jws, issuedAt: c.issuedAt, revoked: c.revoked, revokedReason: c.revokedReason })
  }))
  return r
}
