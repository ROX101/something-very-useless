import { Router } from 'express'
import { and, asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { accessLog, credentials, enrolments, institutions, statutoryAccess } from '../db/schema'
import { audit, maskApaar } from '../lib/audit'
import { requireRole } from '../lib/auth'
import { next } from '../lib/counters'
import { forbidden, handler, notFound, parse } from '../lib/http'
import { log } from '../services/consent'

/**
 * Regulators (NAAC, NBA, NIRF, UGC) read institution records without student consent, as NAD/DigiLocker allows for
 * statutory bodies. That access is still bounded: each grant names one institution, a legal basis and a reference
 * (an assessment or case number), lasts at most 30 days, and every read is written to each student's access log.
 */
export const BASES = [
  'NAAC assessment and accreditation',
  'NBA programme accreditation',
  'NIRF data validation',
  'UGC / AICTE inspection',
  'Court or tribunal order',
  'Statutory investigation',
] as const

const NewAccess = z.object({
  institutionPid: z.string().min(1).max(20),
  basis: z.enum(BASES),
  reference: z.string().trim().min(3, 'Give the assessment, order or case number').max(200),
  days: z.number().int().min(1).max(30).default(14),
})

const shape = (g: typeof statutoryAccess.$inferSelect, inst?: { name: string; city: string; state: string }) => ({
  id: g.id, institutionPid: g.institutionPid, institution: inst?.name, city: inst?.city, state: inst?.state,
  basis: g.basis, reference: g.reference, createdAt: g.createdAt, expiresAt: g.expiresAt, active: Date.parse(g.expiresAt) > Date.now(),
})

export function regulatorRoutes() {
  const r = Router()
  r.use(requireRole('regulator'))

  r.get('/bases', (_req, res) => { res.json(BASES) })

  r.get('/institutions', handler(async (req, res) => {
    res.json(await req.db.select({ pid: institutions.pid, name: institutions.name, city: institutions.city, state: institutions.state }).from(institutions).orderBy(asc(institutions.name)))
  }))

  r.get('/access', handler(async (req, res) => {
    const rows = await req.db.select({ g: statutoryAccess, i: institutions }).from(statutoryAccess)
      .innerJoin(institutions, eq(institutions.pid, statutoryAccess.institutionPid))
      .where(eq(statutoryAccess.userId, req.user!.userId)).orderBy(desc(statutoryAccess.createdAt))
    res.json(rows.map(({ g, i }) => shape(g, i)))
  }))

  r.post('/access', handler(async (req, res) => {
    const b = parse(NewAccess, req.body)
    const inst = await req.db.query.institutions.findFirst({ where: eq(institutions.pid, b.institutionPid) })
    if (!inst) throw notFound('No institution with this permanent ID')
    const g = await req.db.transaction(async (tx) => {
      const id = `SA-${await next(tx, 'statutory', 501)}`
      const [g] = await tx.insert(statutoryAccess).values({
        id, userId: req.user!.userId, org: req.user!.org, institutionPid: inst.pid, basis: b.basis, reference: b.reference,
        expiresAt: new Date(Date.now() + b.days * 86400000).toISOString(),
      }).returning()
      await audit(tx, req.user!, { category: 'Verification', action: 'Opened statutory access', detail: `${id}, ${inst.name} (${inst.pid}), ${b.basis}, ${b.reference}, ${b.days} days`, entity: 'statutory_access', entityId: id })
      return g
    })
    res.status(201).json(shape(g, inst))
  }))

  async function activeGrant(req: Express.Request, id: string) {
    const g = await req.db.query.statutoryAccess.findFirst({ where: and(eq(statutoryAccess.id, id), eq(statutoryAccess.userId, req.user!.userId)) })
    if (!g) throw notFound('No such access')
    if (Date.parse(g.expiresAt) <= Date.now()) throw forbidden('This access has ended. Open a new one with its legal basis.')
    return g
  }

  /** The institution's current roster. Every student listed gets an access-log entry naming the regulator and basis. */
  r.get('/access/:id/students', handler(async (req, res) => {
    const g = await activeGrant(req, req.params.id)
    const rows = await req.db.select({
      apaar: enrolments.apaar, instStudentId: enrolments.instStudentId, name: enrolments.name, programme: enrolments.programme,
      ay: enrolments.ay, gender: enrolments.gender, category: enrolments.category, quota: enrolments.quota, status: enrolments.status, statusDate: enrolments.statusDate,
    }).from(enrolments).where(eq(enrolments.institutionPid, g.institutionPid)).orderBy(asc(enrolments.programme), asc(enrolments.name))

    if (!g.notifiedAt) {
      const linked = [...new Set(rows.map((x) => x.apaar).filter((a): a is string => !!a))]
      const at = new Date().toISOString()
      for (let i = 0; i < linked.length; i += 500) {
        await req.db.insert(accessLog).values(linked.slice(i, i + 500).map((apaar) => ({ apaar, at, actor: g.org, action: `Viewed your enrolment record under statutory access (${g.basis}, ${g.reference})` })))
      }
      await req.db.update(statutoryAccess).set({ notifiedAt: at }).where(eq(statutoryAccess.id, g.id))
    }
    await audit(req.db, req.user!, { category: 'Verification', action: 'Viewed institution roster', detail: `${g.id}, ${g.institutionPid}, ${rows.length} students`, entity: 'statutory_access', entityId: g.id })
    res.json({ access: shape(g), students: rows })
  }))

  r.get('/access/:id/students/:apaar', handler(async (req, res) => {
    const g = await activeGrant(req, req.params.id)
    const apaar = req.params.apaar.replace(/\s/g, '')
    const enrol = await req.db.select().from(enrolments).where(and(eq(enrolments.apaar, apaar), eq(enrolments.institutionPid, g.institutionPid)))
    if (!enrol.length) throw notFound('This student is not on the institution\'s roster')
    const certs = await req.db.select({ certNo: credentials.certNo, degree: credentials.degree, year: credentials.year, cgpa: credentials.cgpa, division: credentials.division, revoked: credentials.revoked, issuedAt: credentials.issuedAt })
      .from(credentials).where(eq(credentials.apaar, apaar))
    await log(req.db, apaar, g.org, `Viewed your full record under statutory access (${g.basis}, ${g.reference})`)
    await audit(req.db, req.user!, { category: 'Verification', action: 'Viewed student record', detail: `${g.id}, APAAR ${maskApaar(apaar)}`, entity: 'student', entityId: apaar })
    res.json({ apaar, enrolments: enrol.map((e) => ({ ay: e.ay, programme: e.programme, name: e.name, dob: e.dob, gender: e.gender, category: e.category, quota: e.quota, status: e.status, statusDate: e.statusDate, receipt: e.submissionReceipt })), credentials: certs })
  }))

  return r
}
