import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { credentials, issuers } from '../db/schema'
import { audit } from '../lib/audit'
import { requireAuth } from '../lib/auth'
import { forbidden, handler, notFound } from '../lib/http'

/** The full certificate (with marks) for printing: only the holder, the issuing university and the AICTE bureau. */
export function credentialRoutes() {
  const r = Router()
  r.get('/:certNo', requireAuth, handler(async (req, res) => {
    const c = await req.db.query.credentials.findFirst({ where: eq(credentials.certNo, req.params.certNo) })
    if (!c) throw notFound('No certificate with this number')
    const u = req.user!
    const allowed = (u.role === 'student' && u.apaar === c.apaar) || (u.role === 'university' && u.issuerDid === c.issuerDid) || u.role === 'aicte_bureau'
    if (!allowed) throw forbidden('Only the student, the issuing university or AICTE can open the full certificate')
    const issuer = c.issuerDid ? await req.db.query.issuers.findFirst({ where: eq(issuers.did, c.issuerDid) }) : null
    if (u.role !== 'student') await audit(req.db, u, { category: 'Verification', action: 'Opened full certificate', detail: c.certNo, entity: 'credential', entityId: c.certNo })
    res.json({
      certNo: c.certNo, apaar: c.apaar, holderName: c.holderName, studentId: c.studentId, programmeCode: c.programmeCode,
      degree: c.degree, year: c.year, cgpa: c.cgpa, division: c.division, issuedAt: c.issuedAt,
      revoked: c.revoked, revokedReason: c.revokedReason, revokedAt: c.revokedAt,
      issuer: issuer && { did: issuer.did, name: issuer.name, short: issuer.short, city: issuer.city },
      jws: c.jws, publicJws: c.publicJws, verifyPath: `/c/${c.certNo}`,
    })
  }))
  return r
}
