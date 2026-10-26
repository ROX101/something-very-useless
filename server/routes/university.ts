import { Router } from 'express'
import { and, asc, desc, eq, ilike, inArray, isNotNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { nameSimilarity } from '../../src/inst/engine/similarity'
import { apaarRegistry, credentials, enrolments, institutions, issuers } from '../db/schema'
import { audit, maskApaar } from '../lib/audit'
import { requireRole } from '../lib/auth'
import { badRequest, conflict, forbidden, handler, notFound, parse } from '../lib/http'
import { issueCredential, revokeCredential } from '../services/credentials'

const Issue = z.object({
  apaar: z.string().transform((s) => s.replace(/\s/g, '')).pipe(z.string().regex(/^\d{12}$/, 'Enter a 12-digit APAAR ID')),
  holderName: z.string().trim().min(2).max(120),
  studentId: z.string().trim().min(2).max(40),
  programmeCode: z.string().trim().regex(/^[A-Z0-9&-]{2,16}$/, 'Programme code like CSE'),
  degree: z.string().trim().min(3).max(160),
  year: z.number().int().min(2000).max(2100),
  cgpa: z.string().trim().regex(/^(10(\.0{1,2})?|\d(\.\d{1,2})?)$/, 'CGPA between 0 and 10, up to 2 decimals'),
  division: z.string().trim().min(3).max(80),
  institutionPid: z.string().optional(),
})

const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function universityRoutes() {
  const r = Router()
  r.use(requireRole('university'))
  r.use((req, _res, nxt) => (req.user!.issuerDid ? nxt() : nxt(forbidden('Account is not linked to a degree-awarding body'))))
  const didOf = (req: Express.Request) => req.user!.issuerDid!

  async function affiliated(req: Express.Request) {
    return req.db.select().from(institutions).where(eq(institutions.awardingDid, didOf(req))).orderBy(asc(institutions.name))
  }

  r.get('/me', handler(async (req, res) => {
    const issuer = await req.db.query.issuers.findFirst({ where: eq(issuers.did, didOf(req)) })
    res.json({ issuer: issuer && { did: issuer.did, name: issuer.name, short: issuer.short, kid: issuer.kid, status: issuer.status }, institutions: await affiliated(req) })
  }))

  /**
   * Students at affiliated institutions, from submitted enrolment returns, with the APAAR ID checked against
   * the registry. This is the mapping a university needs to print APAAR IDs next to its own student IDs.
   */
  async function students(req: Express.Request, q?: string) {
    const pids = (await affiliated(req)).map((i) => i.pid)
    if (!pids.length) return []
    const rows = await req.db.select({ e: enrolments, reg: apaarRegistry }).from(enrolments)
      .leftJoin(apaarRegistry, eq(apaarRegistry.apaar, enrolments.apaar))
      .where(and(inArray(enrolments.institutionPid, pids), q ? or(ilike(enrolments.name, `%${q}%`), ilike(enrolments.instStudentId, `%${q}%`), ilike(enrolments.apaar, `%${q.replace(/\s/g, '')}%`)) : undefined))
      .orderBy(asc(enrolments.institution), asc(enrolments.programme), asc(enrolments.name))
      .limit(5000)
    return rows.map(({ e, reg }) => {
      const verified = Boolean(e.apaar && reg && reg.dob === e.dob && nameSimilarity(reg.name, e.name ?? '') >= 0.9)
      return {
        apaar: e.apaar, instStudentId: e.instStudentId, name: e.name, dob: e.dob, programme: e.programme, institution: e.institution,
        institutionPid: e.institutionPid, ay: e.ay, status: e.status,
        apaarStatus: !e.apaar ? 'No APAAR ID (exception code)' : verified ? 'Verified' : 'Does not match registry',
        printable: verified && e.status === 'active',
      }
    })
  }

  r.get('/students', handler(async (req, res) => {
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim().slice(0, 60) : undefined
    res.json(await students(req, q))
  }))

  /** CSV for certificate and marksheet printing: only APAAR IDs verified against the registry are included. */
  r.get('/students.csv', handler(async (req, res) => {
    const list = (await students(req)).filter((s) => s.printable)
    const header = ['APAAR ID', 'APAAR ID (print format)', 'Institution student ID', 'Name', 'Programme', 'Institution', 'Institution PID', 'Academic year']
    const lines = [header, ...list.map((s) => [s.apaar, s.apaar!.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3'), s.instStudentId, s.name, s.programme, s.institution, s.institutionPid, s.ay])]
    await audit(req.db, req.user!, { category: 'Data', action: 'Exported APAAR IDs for printing', detail: `${list.length} verified students`, entity: 'university', entityId: didOf(req) })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="APAAR_IDs_for_printing.csv"')
    res.send('﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n'))
  }))

  r.get('/credentials', handler(async (req, res) => {
    const rows = await req.db.select().from(credentials).where(eq(credentials.issuerDid, didOf(req))).orderBy(desc(credentials.issuedAt)).limit(1000)
    res.json(rows.map(({ jws: _j, publicJws: _p, ...c }) => c))
  }))

  r.post('/credentials', handler(async (req, res) => {
    const b = parse(Issue, req.body)
    const reg = await req.db.query.apaarRegistry.findFirst({ where: eq(apaarRegistry.apaar, b.apaar) })
    if (!reg) throw badRequest('apaar_not_found', 'This APAAR ID is not in the APAAR registry')
    const sim = nameSimilarity(reg.name, b.holderName)
    if (sim < 0.9) throw badRequest('name_mismatch', `Name does not match the APAAR registry ("${reg.name}")`)
    const pids = (await affiliated(req)).map((i) => i.pid)
    if (b.institutionPid && !pids.includes(b.institutionPid)) throw forbidden('That institution is not affiliated to your university')
    const dup = await req.db.query.credentials.findFirst({
      where: and(eq(credentials.issuerDid, didOf(req)), eq(credentials.apaar, b.apaar), eq(credentials.programmeCode, b.programmeCode), eq(credentials.revoked, false)),
    })
    if (dup) throw conflict('already_issued', `A degree for this student and programme is already issued (${dup.certNo}). Revoke it first to re-issue.`)
    const row = await req.db.transaction(async (tx) => {
      const c = await issueCredential(tx, { ...b, issuerDid: didOf(req), institutionPid: b.institutionPid ?? null }, req.user!.userId)
      await audit(tx, req.user!, { category: 'Submission', action: 'Issued degree credential', detail: `${c.certNo}, APAAR ${maskApaar(b.apaar)}, ${b.degree} ${b.year}`, entity: 'credential', entityId: c.certNo })
      return c
    })
    res.status(201).json({ certNo: row.certNo, statusIndex: row.statusIndex, issuedAt: row.issuedAt })
  }))

  r.post('/credentials/:certNo/revoke', handler(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(5).max(300) }), req.body)
    const existing = await req.db.query.credentials.findFirst({ where: and(eq(credentials.certNo, req.params.certNo), eq(credentials.issuerDid, didOf(req)), isNotNull(credentials.statusIndex)) })
    if (!existing) throw notFound('No such credential issued by your university')
    if (existing.revoked) throw conflict('already_revoked', 'Already revoked')
    const row = await req.db.transaction(async (tx) => {
      const c = await revokeCredential(tx, didOf(req), req.params.certNo, reason)
      await audit(tx, req.user!, { category: 'Submission', action: 'Revoked degree credential', detail: `${req.params.certNo}: ${reason}`, entity: 'credential', entityId: req.params.certNo })
      return c
    })
    res.json({ certNo: row!.certNo, revoked: true, revokedAt: row!.revokedAt })
  }))

  return r
}
