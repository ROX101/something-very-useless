import { Router, type Request, type Response } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { UploadRow } from '../../src/inst/engine/types'
import type { ValidationResult } from '../../src/inst/engine/types'
import { idempotency, institutions, programmes } from '../db/schema'
import { audit, type Who } from '../lib/audit'
import { requireApiKey } from '../lib/apikeys'
import { forbidden, handler, notFound, parse } from '../lib/http'
import { appendRows, createUpload, currentUpload } from '../services/uploads'
import { validate } from '../services/validation'

const AY = '2026-27'
const yn = z.enum(['Y', 'N'])
const str = (max = 200) => z.string().trim().max(max)

/** One enrolment record in API form. Field names follow the Excel template columns, in camelCase. */
export const ApiRecord = z.object({
  apaarId: str(20).default(''),
  apaarException: z.enum(['', 'CONSENT_REFUSED', 'FOREIGN_NATIONAL', 'GENERATION_PENDING']).default(''),
  instStudentId: str(40).min(1),
  name: str(120).min(1),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  gender: z.enum(['M', 'F', 'T']),
  category: str(20).min(1),
  programme: str(120).min(1),
  quota: z.enum(['REGULAR', 'NRI', 'NRI-CONVERTED', 'FN-OCI-CIWG', 'TFW', 'PM-USPY']),
  nri: yn.default('N'),
  oci: yn.default('N'),
  ociCardNo: str(20).default(''),
  fn: yn.default('N'),
  nationality: str(60).default('Indian'),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
})
type ApiRecord = z.infer<typeof ApiRecord>

export const Batch = z.object({
  academicYear: z.literal(AY),
  /** replace: start a new working set; append: add to the current one (send large rosters in several batches). */
  mode: z.enum(['replace', 'append']).default('append'),
  records: z.array(ApiRecord).min(1).max(1000),
})

export const Approvals = z.object({
  academicYear: z.literal(AY),
  institutions: z.array(z.object({
    pid: z.string().regex(/^\d-\d{7,10}$/, 'AICTE permanent ID like 1-9000417'),
    name: str(200).min(2), city: str(80).min(1), state: z.string().length(2),
    university: str(200).optional(), type: str(80).optional(),
    programmes: z.array(z.object({
      code: z.string().regex(/^[A-Z0-9&-]{2,16}$/), label: str(60).min(1), name: str(200).min(1),
      intake: z.number().int().min(0).max(5000), lastYearAdmitted: z.number().int().min(0).max(10000).optional(),
    })).min(1),
  })).min(1).max(500),
})

const toRow = (r: ApiRecord): UploadRow => ({
  rowNo: 0, APAAR_ID: r.apaarId, APAAR_EXCEPTION: r.apaarException, INST_STUDENT_ID: r.instStudentId, NAME: r.name, DOB: r.dob,
  GENDER: r.gender, CATEGORY: r.category, PROGRAMME: r.programme, QUOTA: r.quota, NRI: r.nri, OCI: r.oci, OCI_CARD_NO: r.ociCardNo,
  FN: r.fn, NATIONALITY: r.nationality, ADMISSION_DATE: r.admissionDate,
})

const summary = (v: ValidationResult) => ({
  counts: v.counts, dataErrors: v.dataErrors, fixable: v.fixable,
  alerts: v.alerts.map((a) => ({ rule: a.rule, clause: a.clause, title: a.title, detail: a.detail })),
})

const issues = (v: ValidationResult, rowNos?: Set<number>) => v.rows
  .filter((r) => r.flags.length && (!rowNos || rowNos.has(r.row.rowNo)))
  .map((r) => ({
    rowNo: r.row.rowNo, instStudentId: r.row.INST_STUDENT_ID, status: r.status,
    flags: r.flags.map((f) => ({ rule: f.rule, kind: f.kind, field: f.field, message: f.message, suggestedFix: f.fix?.changes })),
  }))

const clientWho = (req: Request): Who => ({ userId: req.client!.keyId, role: 'api', name: `API key ${req.client!.name}`, org: req.client!.institutionPid ?? 'AICTE' })

/** Runs fn once per Idempotency-Key; a retry with the same key gets the stored response back. */
async function idempotent(req: Request, res: Response, fn: () => Promise<{ status: number; body: unknown }>) {
  const key = req.header('Idempotency-Key')
  if (key) {
    const [hit] = await req.db.select().from(idempotency).where(and(eq(idempotency.apiKeyId, req.client!.keyId), eq(idempotency.key, key))).limit(1)
    if (hit) { res.setHeader('Idempotent-Replayed', 'true'); res.status(hit.status).json(hit.response); return }
  }
  const out = await fn()
  if (key && out.status < 500) {
    await req.db.insert(idempotency).values({ key: key.slice(0, 200), apiKeyId: req.client!.keyId, status: out.status, response: out.body }).onConflictDoNothing()
  }
  res.status(out.status).json(out.body)
}

export function v1Routes() {
  const r = Router()
  r.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, keyGenerator: (req) => req.header('authorization') ?? req.header('x-api-key') ?? ipKeyGenerator(req.ip ?? ''),
    message: { error: 'rate_limited', message: 'Too many requests for this key. Slow down and retry.' } }))
  r.use(requireApiKey)

  const institutionOnly = (req: Request) => {
    if (req.client!.scope !== 'institution') throw forbidden('This key is not an institution key')
    if (req.client!.institutionPid !== req.params.pid) throw forbidden('This key belongs to a different institution')
    return req.params.pid
  }

  // POST /v1/institutions/{pid}/enrolments:batch  (also accepted as /enrolments/batch)
  const batch = handler(async (req, res) => {
    const pid = institutionOnly(req)
    const body = parse(Batch, req.body)
    await idempotent(req, res, async () => {
      const rows = body.records.map(toRow)
      const who = clientWho(req)
      const before = (await currentUpload(req.db, pid))?.rows.length ?? 0
      const u = body.mode === 'replace'
        ? await createUpload(req.db, who, pid, `API batch, ${new Date().toISOString().slice(0, 10)}`, rows.map((x, i) => ({ ...x, rowNo: i + 2 })), 'api', req.client!.createdBy)
        : await appendRows(req.db, who, pid, `API batch, ${new Date().toISOString().slice(0, 10)}`, rows, req.client!.createdBy)
      const v = await validate(req.db, pid, u.rows)
      const mine = new Set(u.rows.slice(body.mode === 'replace' ? 0 : before).map((x) => x.rowNo))
      return {
        status: 200,
        body: {
          uploadId: u.id, mode: body.mode, received: rows.length, totalRows: u.rows.length,
          readyToSubmit: v.dataErrors === 0,
          summary: summary(v),
          issues: issues(v, mine),
          next: v.dataErrors === 0
            ? 'All rows pass. The nodal officer reviews and submits from the institution portal (the declaration is signed by a person, not by the API).'
            : 'Fix the rows listed in issues and send them again, or correct them in the portal.',
        },
      }
    })
  })
  r.post(/^\/institutions\/([^/]+)\/enrolments:batch$/, (req, _res, nxt) => { req.params.pid = (req.params as unknown as string[])[0]; nxt() }, batch)
  r.post('/institutions/:pid/enrolments/batch', batch)

  r.get('/institutions/:pid/enrolments/validation', handler(async (req, res) => {
    const pid = institutionOnly(req)
    const u = await currentUpload(req.db, pid)
    if (!u) throw notFound('Nothing received yet for this academic year')
    const v = await validate(req.db, pid, u.rows)
    res.json({ uploadId: u.id, totalRows: u.rows.length, readyToSubmit: v.dataErrors === 0, summary: summary(v), issues: issues(v) })
  }))

  r.get('/institutions/:pid/students/:id', handler(async (req, res) => {
    const pid = institutionOnly(req)
    const u = await currentUpload(req.db, pid)
    const id = req.params.id.replace(/\s/g, '')
    const row = u?.rows.find((x) => x.INST_STUDENT_ID === req.params.id || x.APAAR_ID.replace(/\s/g, '') === id)
    if (!u || !row) throw notFound('No such student in the current data')
    const v = await validate(req.db, pid, u.rows)
    const rr = v.rows.find((x) => x.row.rowNo === row.rowNo)!
    res.json({ row, status: rr.status, flags: rr.flags })
  }))

  // AICTE systems: approved intake per programme (from the approval process), upserted per institution.
  r.post('/aicte/approvals', handler(async (req, res) => {
    if (req.client!.scope !== 'aicte') throw forbidden('Only AICTE system keys can import approvals')
    const body = parse(Approvals, req.body)
    let progs = 0
    await req.db.transaction(async (tx) => {
      for (const i of body.institutions) {
        await tx.insert(institutions).values({ pid: i.pid, name: i.name, city: i.city, state: i.state, university: i.university, type: i.type })
          .onConflictDoUpdate({ target: institutions.pid, set: { name: i.name, city: i.city, state: i.state, university: sql`coalesce(excluded.university, ${institutions.university})`, type: sql`coalesce(excluded.type, ${institutions.type})` } })
        for (const p of i.programmes) {
          await tx.insert(programmes).values({ institutionPid: i.pid, ...p, lastYearAdmitted: p.lastYearAdmitted ?? null })
            .onConflictDoUpdate({ target: [programmes.institutionPid, programmes.code], set: { label: p.label, name: p.name, intake: p.intake, lastYearAdmitted: p.lastYearAdmitted ?? null } })
          progs++
        }
      }
      await audit(tx, clientWho(req), { category: 'Administration', action: 'Imported approved intake', detail: `${body.institutions.length} institutions, ${progs} programmes, AY ${body.academicYear}`, entity: 'approvals', entityId: body.academicYear })
    })
    res.json({ institutions: body.institutions.length, programmes: progs })
  }))

  return r
}
