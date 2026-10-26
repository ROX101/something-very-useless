import { Router } from 'express'
import { createHash } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { COLUMNS, type UploadRow } from '../../src/inst/engine/types'
import { runRules } from '../../src/inst/engine/rules'
import { normaliseName } from '../../src/inst/engine/similarity'
import { apiKeys, complianceAlerts, enrolments, institutions, programmes, submissions, uploads } from '../db/schema'
import { createKey, toPublicKey } from '../lib/apikeys'
import { audit } from '../lib/audit'
import { requireRole } from '../lib/auth'
import { badRequest, conflict, forbidden, handler, notFound, parse } from '../lib/http'
import { next } from '../lib/counters'
import { buildContext, validate } from '../services/validation'
import { createUpload, currentUpload } from '../services/uploads'

const MAX_ROWS = 20000
const AY = '2026-27'

const Row = z.object({
  rowNo: z.number().int().nonnegative(),
  ...Object.fromEntries(COLUMNS.map((c) => [c, z.string().max(200)])),
}) as unknown as z.ZodType<UploadRow>

const Upload = z.object({ fileName: z.string().min(1).max(255), rows: z.array(Row).min(1).max(MAX_ROWS) })
const Note = z.object({ action: z.string().min(1).max(120), detail: z.string().max(500) })
const Rows = z.object({ rows: z.array(Row).max(MAX_ROWS), fixes: z.number().int().min(0).max(MAX_ROWS), note: Note.optional() })
const SubmitBody = z.object({ declaration: z.literal(true) })

const toSubmission = (s: typeof submissions.$inferSelect) => ({
  receiptNo: s.receiptNo, submittedAt: s.submittedAt, submittedBy: s.submittedBy, records: s.records,
  alerts: s.alerts, hash: s.hash, fileName: s.fileName, status: s.status,
})

export function instRoutes() {
  const r = Router()
  r.use(requireRole('inst_admin', 'inst_operator'))
  r.use((req, _res, nxt) => (req.user!.institutionPid ? nxt() : nxt(forbidden('Account is not linked to an institution'))))

  const pidOf = (req: Express.Request) => req.user!.institutionPid!


  r.get('/state', handler(async (req, res) => {
    const pid = pidOf(req)
    const [inst, progs, upload, subs] = await Promise.all([
      req.db.query.institutions.findFirst({ where: eq(institutions.pid, pid) }),
      req.db.select().from(programmes).where(eq(programmes.institutionPid, pid)),
      currentUpload(req.db, pid),
      req.db.select().from(submissions).where(eq(submissions.institutionPid, pid)).orderBy(desc(submissions.submittedAt)),
    ])
    const ctx = upload ? await buildContext(req.db, pid, upload.rows) : null
    const crossEnrolments = ctx?.otherEnrolments ?? []
    const probable = ctx?.probable ?? []
    res.json({
      institution: inst,
      programmes: progs,
      upload: upload && { id: upload.id, fileName: upload.fileName, rows: upload.rows, uploadedAt: upload.uploadedAt, fixesApplied: upload.fixesApplied },
      crossEnrolments,
      probable,
      submissions: subs.map(toSubmission),
    })
  }))

  r.post('/uploads', handler(async (req, res) => {
    const pid = pidOf(req)
    const body = parse(Upload, req.body)
    const created = await createUpload(req.db, req.user!, pid, body.fileName, body.rows)
    const ctx = await buildContext(req.db, pid, created.rows)
    const result = runRules(created.rows, ctx)
    res.status(201).json({
      upload: { id: created.id, fileName: created.fileName, uploadedAt: created.uploadedAt, fixesApplied: 0 },
      crossEnrolments: ctx.otherEnrolments,
      probable: ctx.probable,
      result,
    })
  }))

  r.put('/uploads/current/rows', handler(async (req, res) => {
    const pid = pidOf(req)
    const body = parse(Rows, req.body)
    const u = await currentUpload(req.db, pid)
    if (!u) throw notFound('No upload in progress')
    const fixesApplied = u.fixesApplied + body.fixes
    await req.db.transaction(async (tx) => {
      await tx.update(uploads).set({ rows: body.rows, fixesApplied, updatedAt: new Date().toISOString() }).where(eq(uploads.id, u.id))
      await audit(tx, req.user!, {
        category: 'Data',
        action: body.note?.action ?? (body.fixes > 1 ? 'Applied suggested fixes' : 'Fixed a row'),
        detail: body.note?.detail ?? `${body.fixes} change${body.fixes === 1 ? '' : 's'}, ${body.rows.length} rows now`,
        entity: 'upload', entityId: String(u.id),
      })
    })
    const ctx = await buildContext(req.db, pid, body.rows)
    res.json({ fixesApplied, crossEnrolments: ctx.otherEnrolments, probable: ctx.probable })
  }))

  r.delete('/uploads/current', handler(async (req, res) => {
    const pid = pidOf(req)
    const u = await currentUpload(req.db, pid)
    if (u) {
      await req.db.transaction(async (tx) => {
        await tx.update(uploads).set({ current: false }).where(eq(uploads.id, u.id))
        await audit(tx, req.user!, { category: 'Data', action: 'Removed uploaded file', detail: u.fileName, entity: 'upload', entityId: String(u.id) })
      })
    }
    res.status(204).end()
  }))

  r.get('/validation', handler(async (req, res) => {
    const pid = pidOf(req)
    const u = await currentUpload(req.db, pid)
    if (!u) throw notFound('No upload in progress')
    res.json(await validate(req.db, pid, u.rows))
  }))

  // ERP integration keys. Anyone at the institution can see them; only the nodal officer creates or revokes.
  r.get('/api-keys', handler(async (req, res) => {
    const rows = await req.db.select().from(apiKeys).where(eq(apiKeys.institutionPid, pidOf(req))).orderBy(desc(apiKeys.createdAt))
    res.json(rows.map(toPublicKey))
  }))

  r.post('/api-keys', requireRole('inst_admin'), handler(async (req, res) => {
    const { name } = parse(z.object({ name: z.string().trim().min(2).max(60) }), req.body)
    const k = await createKey(req.db, { scope: 'institution', institutionPid: pidOf(req), name, createdBy: req.user!.userId })
    await audit(req.db, req.user!, { category: 'Administration', action: 'Created API key', detail: `${name} (${k.id})`, entity: 'api_key', entityId: k.id })
    res.status(201).json({ id: k.id, name, key: k.key })
  }))

  r.delete('/api-keys/:id', requireRole('inst_admin'), handler(async (req, res) => {
    const [k] = await req.db.update(apiKeys).set({ revokedAt: new Date().toISOString() })
      .where(and(eq(apiKeys.id, req.params.id), eq(apiKeys.institutionPid, pidOf(req)))).returning()
    if (!k) throw notFound('No such key')
    await audit(req.db, req.user!, { category: 'Administration', action: 'Revoked API key', detail: `${k.name} (${k.id})`, entity: 'api_key', entityId: k.id })
    res.status(204).end()
  }))

  r.get('/submissions', handler(async (req, res) => {
    const rows = await req.db.select().from(submissions).where(eq(submissions.institutionPid, pidOf(req))).orderBy(desc(submissions.submittedAt))
    res.json(rows.map(toSubmission))
  }))

  r.post('/submissions', requireRole('inst_admin'), handler(async (req, res) => {
    parse(SubmitBody, req.body)
    const pid = pidOf(req)
    const u = await currentUpload(req.db, pid)
    if (!u) throw badRequest('nothing_to_submit', 'Upload and validate the admissions file first')

    // The server's own validation is authoritative: never trust the browser's result.
    const result = await validate(req.db, pid, u.rows)
    if (result.dataErrors > 0) throw conflict('data_errors', `${result.dataErrors} data errors must be resolved before submission`)

    const inst = (await req.db.query.institutions.findFirst({ where: eq(institutions.pid, pid) }))!
    const hash = createHash('sha256').update(JSON.stringify(u.rows)).digest('hex')
    const byRow = new Map(u.rows.map((row) => [row.rowNo, row]))
    const excess = result.ledger.reduce((n, l) => n + l.excess, 0)

    const saved = await req.db.transaction(async (tx) => {
      const n = await next(tx, `receipt:${pid}`, 91)
      const receiptNo = `AS-26-${pid.slice(-4)}-${String(n).padStart(4, '0')}`
      const submittedAt = new Date().toISOString()

      const [s] = await tx.insert(submissions).values({
        receiptNo, institutionPid: pid, uploadId: u.id, ay: AY, submittedAt,
        submittedBy: `${req.user!.name} (${req.user!.userId})`, fileName: u.fileName,
        records: result.counts.total, alerts: result.alerts.length, hash,
        snapshot: {
          counts: result.counts, excess, alerts: result.alerts,
          rows: u.rows.map(({ rowNo, NAME, INST_STUDENT_ID, PROGRAMME, APAAR_ID, DOB, GENDER, CATEGORY, QUOTA, NRI, OCI, FN, NATIONALITY, ADMISSION_DATE, APAAR_EXCEPTION }) =>
            ({ rowNo, NAME, INST_STUDENT_ID, PROGRAMME, APAAR_ID, DOB, GENDER, CATEGORY, QUOTA, NRI, OCI, FN, NATIONALITY, ADMISSION_DATE, APAAR_EXCEPTION })),
        },
      }).returning()

      // A revised submission supersedes the institution's earlier live alerts.
      await tx.delete(complianceAlerts).where(and(eq(complianceAlerts.institutionPid, pid), eq(complianceAlerts.live, true)))
      if (result.alerts.length) {
        await tx.insert(complianceAlerts).values(result.alerts.map((a) => ({
          id: `L-${receiptNo}-${a.id}`, institutionPid: pid, institution: inst.name, city: inst.city, state: inst.state,
          rule: a.rule, clause: a.clause, title: a.title, detail: a.detail, detectedAt: submittedAt, receiptNo, live: true,
          rows: a.rowNos.map((no) => {
            const row = byRow.get(no)!
            return { rowNo: no, name: row.NAME, studentId: row.INST_STUDENT_ID, programme: row.PROGRAMME, apaar: row.APAAR_ID }
          }),
        })))
      }

      // Publish this institution's roster to the national enrolment register. Other institutions' uploads are
      // checked against it (R10 by APAAR ID; probable duplicates by name + DOB, including students without an APAAR ID).
      await tx.delete(enrolments).where(and(eq(enrolments.institutionPid, pid), eq(enrolments.ay, AY)))
      const seen = new Set<string>()
      const roster = u.rows.flatMap((row) => {
        const apaar = row.APAAR_ID.replace(/\s/g, '')
        const valid = /^\d{12}$/.test(apaar)
        const key = valid ? `a:${apaar}` : `s:${row.INST_STUDENT_ID}`
        if (seen.has(key)) return []
        seen.add(key)
        return [{
          apaar: valid ? apaar : null, institutionPid: pid, institution: inst.name, city: inst.city, ay: AY, programme: row.PROGRAMME,
          submissionReceipt: receiptNo, instStudentId: row.INST_STUDENT_ID, name: row.NAME, nameKey: normaliseName(row.NAME),
          dob: /^\d{4}-\d{2}-\d{2}$/.test(row.DOB) ? row.DOB : null, gender: row.GENDER.slice(0, 1) || null,
          category: row.CATEGORY.slice(0, 12) || null, quota: row.QUOTA.slice(0, 16) || null,
        }]
      })
      for (let i = 0; i < roster.length; i += 1000) {
        await tx.insert(enrolments).values(roster.slice(i, i + 1000)).onConflictDoNothing()
      }

      await audit(tx, req.user!, {
        category: 'Submission', action: 'Submitted enrolment data to AICTE',
        detail: `Receipt ${receiptNo}, ${s.records} records, ${s.alerts} compliance alerts, SHA-256 ${hash.slice(0, 16)}`,
        entity: 'submission', entityId: receiptNo,
      })
      return s
    })

    res.status(201).json(toSubmission(saved))
  }))

  return r
}
