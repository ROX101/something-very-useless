import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { eq, sql } from 'drizzle-orm'
import type { Express } from 'express'
import { createApp } from './app'
import { createDb, createPool, runMigrations, type Db } from './db/client'
import { seed } from './db/seed'
import { auditLog, complianceAlerts, enrolments, institutions, users } from './db/schema'
import { canonical, type TrailEntry } from './lib/audit'
import { createHash } from 'node:crypto'
import { decodeJwt } from 'jose'
import { readFileSync } from 'node:fs'
import { generateDataset } from '../src/inst/data/generate'
import { applyAllFixes } from '../src/inst/engine/rules'
import type { ValidationResult } from '../src/inst/engine/types'

const PASSWORD = 'Demo@2026'
const pool = createPool(process.env.DATABASE_URL)
let db: Db
let app: Express

async function login(userId: string) {
  const agent = request.agent(app)
  const r = await agent.post('/api/auth/login').send({ userId, password: PASSWORD })
  expect(r.status, `login ${userId}: ${JSON.stringify(r.body)}`).toBe(200)
  return agent
}

beforeAll(async () => {
  db = createDb(pool)
  await runMigrations(db)
  await seed(db, { force: true })
  app = createApp({ db, loginLimit: 1000 })
})

afterAll(async () => { await pool.end() })

describe('health', () => {
  it('reports the database is up', async () => {
    const r = await request(app).get('/api/health')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ status: 'ok', db: 'up' })
  })
})

describe('seed', () => {
  it('loads the demo logins and reference data but no activity', async () => {
    const count = async (table: string) => (await db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from ${table}`))).rows[0].n
    expect(await count('users')).toBe(9)
    expect(await count('institutions')).toBe(1)
    expect(await count('programmes')).toBe(5)
    for (const t of ['compliance_alerts', 'verification_requests', 'access_log', 'enrolments', 'submissions', 'uploads', 'alert_actions']) {
      expect(await count(t), t).toBe(0)
    }
  })
})

describe('auth', () => {
  it('signs in with email and with a spaced APAAR ID', async () => {
    const a = await login('nodal@aranya-tech.edu.in')
    expect((await a.get('/api/auth/me')).body.account).toMatchObject({ role: 'inst_admin', name: 'Dr. Sunanda Patil' })
    const s = await login('4471 2093 6618')
    expect((await s.get('/api/auth/me')).body.account.role).toBe('student')
  })

  it('rejects a wrong password and an unknown user', async () => {
    const bad = await request(app).post('/api/auth/login').send({ userId: 'nodal@aranya-tech.edu.in', password: 'nope' })
    expect(bad.status).toBe(401)
    expect(bad.body.error).toBe('bad_password')
    const missing = await request(app).post('/api/auth/login').send({ userId: 'ghost@example.com', password: PASSWORD })
    expect(missing.body.error).toBe('not_found')
  })

  it('enforces the AICTE domain policy on the server', async () => {
    const [u] = await db.select().from(users).where(eq(users.userId, 'nodal@aranya-tech.edu.in'))
    await db.insert(users).values({ ...u, userId: 'imposter@gmail.com', role: 'aicte_bureau' })
    const r = await request(app).post('/api/auth/login').send({ userId: 'imposter@gmail.com', password: PASSWORD })
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('domain_policy')
  })

  it('treats a tampered cookie as signed out', async () => {
    const r = await request(app).get('/api/auth/me').set('Cookie', 'as_session=eyJhbGciOiJIUzI1NiJ9.e30.forged')
    expect(r.status).toBe(401)
  })

  it('logs out', async () => {
    const a = await login('operator@aranya-tech.edu.in')
    expect((await a.post('/api/auth/logout')).status).toBe(204)
    expect((await a.get('/api/auth/me')).status).toBe(401)
  })
})

describe('role enforcement', () => {
  it('blocks other portals', async () => {
    const student = await login('447120936618')
    expect((await student.get('/api/inst/state')).status).toBe(403)
    expect((await student.get('/api/aicte/alerts')).status).toBe(403)
    const verifier = await login('kabir.menon@tarangsoftware.in')
    expect((await verifier.get('/api/student/requests')).status).toBe(403)
    expect((await request(app).get('/api/inst/state')).status).toBe(401)
  })
})

describe('institution upload → validate → fix → submit', () => {
  const rows = generateDataset().rows
  let first: ValidationResult

  it('validates on the server with the same results as the browser engine', async () => {
    const a = await login('operator@aranya-tech.edu.in')
    const r = await a.post('/api/inst/uploads').send({ fileName: 'Aranya_AY2026-27_FirstYear.xlsx', rows })
    expect(r.status).toBe(201)
    first = r.body.result
    // No other institution has submitted, so there is no cross-enrolment (R10) to find.
    expect(first.counts).toEqual({ total: 509, clean: 482, action: 17, auto: 10 })
    expect(first.fixable).toBe(12)
    expect(first.alerts.map((x) => x.rule).sort()).toEqual(['R06', 'R07'])
    expect(r.body.crossEnrolments).toEqual([])
  })

  it('rejects malformed rows', async () => {
    const a = await login('operator@aranya-tech.edu.in')
    const r = await a.post('/api/inst/uploads').send({ fileName: 'x.xlsx', rows: [{ rowNo: 2, NAME: 5 }] })
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('invalid_request')
    // a rejected upload must not replace the current one
    expect((await a.get('/api/inst/state')).body.upload.rows).toHaveLength(509)
  })

  it('does not let a data operator submit', async () => {
    const a = await login('operator@aranya-tech.edu.in')
    expect((await a.post('/api/inst/submissions').send({ declaration: true })).status).toBe(403)
  })

  it('blocks submission while data errors remain', async () => {
    const a = await login('nodal@aranya-tech.edu.in')
    const r = await a.post('/api/inst/submissions').send({ declaration: true })
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('data_errors')
  })

  it('accepts the fixed rows and issues a receipt', async () => {
    const a = await login('nodal@aranya-tech.edu.in')
    const fixed = applyAllFixes(rows, first)
    expect((await a.put('/api/inst/uploads/current/rows').send({ rows: fixed, fixes: 12 })).body.fixesApplied).toBe(12)
    const v = await a.get('/api/inst/validation')
    expect(v.body.dataErrors).toBe(0)
    expect(v.body.counts.total).toBe(507)

    const s = await a.post('/api/inst/submissions').send({ declaration: true })
    expect(s.status).toBe(201)
    expect(s.body).toMatchObject({ receiptNo: 'AS-26-0417-0091', records: 507, alerts: 2, status: 'Received' })
    expect(s.body.hash).toMatch(/^[0-9a-f]{64}$/)

    const state = await a.get('/api/inst/state')
    expect(state.body.submissions).toHaveLength(1)
    expect(state.body.upload.fixesApplied).toBe(12)
  })

  it('publishes enrolments so R10 can see this institution', async () => {
    const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from enrolments where institution_pid = '1-9000417'`)
    expect(r.rows[0].n).toBeGreaterThan(490)
  })
})

describe('AICTE', () => {
  it('sees only real alerts, from the live submission', async () => {
    const a = await login('meena.iyer@aicte-india.org')
    const alerts = (await a.get('/api/aicte/alerts')).body
    expect(alerts).toHaveLength(2)
    expect(alerts.every((x: { live?: boolean }) => x.live)).toBe(true)
    expect(alerts[0]).toMatchObject({ institution: 'Aranya Institute of Technology', state: 'MH', receiptNo: 'AS-26-0417-0091' })
    expect(alerts[0].rows.length).toBeGreaterThan(0)

    const live = (await a.get('/api/aicte/live')).body
    expect(live.submission.receiptNo).toBe('AS-26-0417-0091')
    expect(live.alerts).toHaveLength(2)
    expect(live.excess).toBe(3)
  })

  it('computes KPIs from the database, not a fixed baseline', async () => {
    const a = await login('meena.iyer@aicte-india.org')
    const k = (await a.get('/api/aicte/kpis')).body
    expect(k).toMatchObject({ institutions: 1, submitted: 1, records: 507, openAlerts: 2, crossDuplicates: 0 })
    // 6 FN/exception rows have no APAAR ID out of 507
    expect(k.apaarLinkedPct).toBeCloseTo(98.8, 1)
    expect(k.exceptionPct).toBeCloseTo(1.2, 1)

    const ins = (await a.get('/api/aicte/insights')).body
    expect(ins.states).toEqual([{ code: 'MH', institutions: 1, submitted: 1, excessAlerts: 1, openAlerts: 2, apaarPct: k.apaarLinkedPct }])
    expect(ins.watchlist).toHaveLength(1)
    expect(ins.watchlist[0]).toMatchObject({ pid: '1-9000417', risk: 40 })
    expect(ins.rings).toEqual([])
  })

  it('scopes a regional officer to their states', async () => {
    await db.insert(institutions).values({ pid: '1-9000932', name: 'Meghavarsha Institute of Technology', city: 'Bhopal', state: 'MP' })
    await db.insert(complianceAlerts).values({
      id: 'T-MP-R06', institutionPid: '1-9000932', institution: 'Meghavarsha Institute of Technology', city: 'Bhopal', state: 'MP',
      rule: 'R06', clause: '7.4(g)', title: 'test alert', detail: 'test', detectedAt: new Date().toISOString(), live: true,
    })
    const r = await login('rahul.kulkarni@aicte-india.org')
    const alerts = (await r.get('/api/aicte/alerts')).body
    expect(alerts.length).toBe(2)
    expect(alerts.every((x: { state: string }) => ['MH', 'GA'].includes(x.state))).toBe(true)
    expect((await r.get('/api/aicte/kpis')).body.institutions).toBe(1)
    expect((await r.post('/api/aicte/alerts/T-MP-R06/actions').send({ status: 'Reviewed, no action' })).status).toBe(403)
    const b = await login('meena.iyer@aicte-india.org')
    expect((await b.get('/api/aicte/kpis')).body).toMatchObject({ institutions: 2, openAlerts: 3 })
  })

  it('records case actions, and closing an alert takes it off the counts', async () => {
    const a = await login('meena.iyer@aicte-india.org')
    await a.post('/api/aicte/alerts/T-MP-R06/actions').send({ status: 'Referred to Regional Office', note: 'Check admissions' })
    expect((await a.get('/api/aicte/kpis')).body.openAlerts).toBe(3)
    await a.post('/api/aicte/alerts/T-MP-R06/actions').send({ status: 'Reviewed, no action', note: '' })
    const cases = (await a.get('/api/aicte/cases')).body
    expect(cases['T-MP-R06']).toMatchObject({ status: 'Reviewed, no action', by: 'Meena Iyer' })
    expect((await a.get('/api/aicte/kpis')).body.openAlerts).toBe(2)
    expect((await a.post('/api/aicte/alerts/T-MP-R06/actions').send({ status: 'Closed' })).status).toBe(400)
  })

  it('finds a ring once another institution enrols the same student', async () => {
    const [mine] = (await db.execute<{ apaar: string }>(sql`select apaar from enrolments where institution_pid = '1-9000417' order by apaar limit 1`)).rows
    await db.insert(enrolments).values({ apaar: mine.apaar, institutionPid: '1-9000932', institution: 'Meghavarsha Institute of Technology', city: 'Bhopal', ay: '2026-27', submissionReceipt: 'AS-26-0932-0001' })
    const a = await login('meena.iyer@aicte-india.org')
    const rings = (await a.get('/api/aicte/rings')).body
    expect(rings).toHaveLength(1)
    expect(rings[0].students).toHaveLength(1)
    expect(rings[0].students[0].apaar).toBe(mine.apaar)
    expect(rings[0].students[0].name).toBeTruthy()
    expect((await a.get('/api/aicte/kpis')).body.crossDuplicates).toBe(1)

    // and the institution's next look at its upload shows the cross-enrolment for R10
    const n = await login('nodal@aranya-tech.edu.in')
    const st = (await n.get('/api/inst/state')).body
    expect(st.crossEnrolments).toEqual([expect.objectContaining({ apaar: mine.apaar, pid: '1-9000932' })])
    expect((await n.get('/api/inst/validation')).body.byRule.R10).toBe(1)
  })
})

describe('consent (DPDP s. 6)', () => {
  const APAAR = '447120936618'

  it('hides the record until the student allows it', async () => {
    const v = await login('kabir.menon@tarangsoftware.in')
    const r = await v.get(`/api/verifier/records/${APAAR}`)
    expect(r.status).toBe(403)
    expect(r.body.error).toBe('no_consent')
  })

  it('sends a request, then stops duplicates and unknown students', async () => {
    const v = await login('kabir.menon@tarangsoftware.in')
    const first = await v.post('/api/verifier/requests').send({ apaar: APAAR, purpose: 'Pre-employment background verification', reference: 'Offer letter TSPL/HR/OL/2026/1187', validityDays: 7, retentionDays: 90 })
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ id: 'RQ-1001', status: 'Pending', reference: 'Offer letter TSPL/HR/OL/2026/1187', retentionDays: 90 })
    expect((await v.post('/api/verifier/requests').send({ apaar: APAAR, purpose: 'Employment verification', validityDays: 7 })).status).toBe(409)
    expect((await v.post('/api/verifier/requests').send({ apaar: '999999999999', purpose: 'Employment verification', validityDays: 7 })).status).toBe(404)
  })

  it('grants, shows shared fields only, logs the read, and revokes', async () => {
    const s = await login('447120936618')
    const pending = (await s.get('/api/student/requests')).body
    expect(pending[0]).toMatchObject({ id: 'RQ-1001', status: 'Pending' })

    const ok = await s.post('/api/student/requests/RQ-1001/decide').send({ status: 'Approved' })
    expect(ok.body).toMatchObject({ status: 'Approved', consentNo: 'CN-7731' })
    expect((await s.post('/api/student/requests/RQ-1001/decide').send({ status: 'Refused' })).status).toBe(409)

    const v = await login('kabir.menon@tarangsoftware.in')
    const rec = await v.get('/api/verifier/records/4471 2093 6618')
    expect(rec.status).toBe(200)
    expect(rec.body).toMatchObject({ name: 'Ritika Deshmukh', status: 'Awarded', consentNo: 'CN-7731' })
    expect(rec.body).not.toHaveProperty('cgpa')
    expect(rec.body).not.toHaveProperty('dob')

    const log = (await s.get('/api/student/log')).body
    expect(log[0].action).toBe('Viewed your degree status (CN-7731)')

    expect((await s.post('/api/student/requests/RQ-1001/revoke')).body.status).toBe('Revoked')
    expect((await v.get(`/api/verifier/records/${APAAR}`)).status).toBe(403)
  })

  it('expires consent after its validity', async () => {
    const v = await login('kabir.menon@tarangsoftware.in')
    const req = (await v.post('/api/verifier/requests').send({ apaar: APAAR, purpose: 'Background check before joining', validityDays: 1 })).body
    expect(req.id).toBe('RQ-1002')
    const s = await login('447120936618')
    await s.post(`/api/student/requests/${req.id}/decide`).send({ status: 'Approved' })
    await db.execute(sql`update verification_requests set expires_at = now() - interval '1 minute' where id = ${req.id}`)
    expect((await v.get(`/api/verifier/records/${APAAR}`)).status).toBe(403)
    const mine = (await s.get('/api/student/requests')).body.find((r: { id: string }) => r.id === req.id)
    expect(mine.status).toBe('Expired')
  })

  it('cannot touch another student’s request', async () => {
    const other = await login('447120936618')
    expect((await other.post('/api/student/requests/RQ-9999/decide').send({ status: 'Approved' })).status).toBe(404)
  })
})

describe('migration 0001 on a database seeded by the old version', () => {
  it('removes the old sample rows and keeps real data', async () => {
    await db.insert(institutions).values({ pid: '1-9001105', name: 'Trivikram College of Engineering', city: 'Raipur', state: 'CG' })
    await db.insert(complianceAlerts).values({
      id: 'S-1105-R10', institutionPid: '1-9001105', institution: 'Trivikram College of Engineering', city: 'Raipur', state: 'CG',
      rule: 'R10', clause: '', title: 'old sample', detail: 'x', detectedAt: '2026-10-24T15:05:00+05:30', live: false,
    })
    await db.execute(sql`insert into alert_actions (alert_id, status, "by") values ('S-1105-R10', 'Open', 'x')`)
    await db.execute(sql`update verification_requests set id = 'RQ-OLD' where id = 'RQ-1001'`)
    await db.execute(sql`insert into verification_requests (id, apaar, verifier, verifier_org, purpose, validity_days, created_at)
      values ('RQ-1001', '447120936618', 'Kabir Menon', 'Tarang Software Pvt. Ltd.', 'Employment verification', 7, '2026-10-25T10:00:00Z')`)
    await db.execute(sql`insert into access_log (apaar, at, actor, action) values ('447120936618', '2026-10-25T10:00:00Z', 'Tarang Software Pvt. Ltd.', 'Requested to verify your degree')`)
    await db.execute(sql`insert into enrolments (apaar, institution_pid, institution, city, ay) values ('111111111111', '1-9000932', 'Meghavarsha Institute of Technology', 'Bhopal', '2026-27')`)
    const before = (await db.execute<{ n: number }>(sql`select count(*)::int as n from access_log`)).rows[0].n

    const file = readFileSync('server/db/migrations/0001_remove_seeded_demo_data.sql', 'utf8')
    for (const stmt of file.split('--> statement-breakpoint')) await db.execute(sql.raw(stmt))

    const one = async (q: ReturnType<typeof sql>) => (await db.execute<{ n: number }>(q)).rows[0].n
    expect(await one(sql`select count(*)::int as n from compliance_alerts where id like 'S-%'`)).toBe(0)
    expect(await one(sql`select count(*)::int as n from alert_actions where alert_id like 'S-%'`)).toBe(0)
    expect(await one(sql`select count(*)::int as n from verification_requests where id = 'RQ-1001'`)).toBe(0)
    expect(await one(sql`select count(*)::int as n from access_log`)).toBe(before - 1)
    expect(await one(sql`select count(*)::int as n from enrolments where submission_receipt is null`)).toBe(0)
    expect(await one(sql`select count(*)::int as n from institutions where pid = '1-9001105'`)).toBe(0)
    // kept: real activity and anything referenced by real data
    expect(await one(sql`select count(*)::int as n from verification_requests where id = 'RQ-OLD'`)).toBe(1)
    expect(await one(sql`select count(*)::int as n from compliance_alerts where live`)).toBeGreaterThan(0)
    expect(await one(sql`select count(*)::int as n from enrolments where institution_pid = '1-9000417'`)).toBeGreaterThan(490)
    expect(await one(sql`select count(*)::int as n from users`)).toBeGreaterThanOrEqual(7)
    expect(await one(sql`select count(*)::int as n from institutions where pid = '1-9000417'`)).toBe(1)
  })
})

describe('audit trail', () => {
  const sha = (x: string) => createHash('sha256').update(x).digest('hex')

  it('records server events in readable form, including failed sign-ins', async () => {
    await request(app).post('/api/auth/login').send({ userId: 'nodal@aranya-tech.edu.in', password: 'wrong' })
    const a = await login('sysadmin@aicte-india.org')
    const trail: TrailEntry[] = (await a.get('/api/aicte/audit/trail')).body
    const find = (action: string) => trail.find((e) => e.action === action)
    expect(find('Submitted enrolment data to AICTE')).toMatchObject({ actor: 'Dr. Sunanda Patil', role: 'Institution Admin (Nodal Officer)', category: 'Submission' })
    expect(find('Submitted enrolment data to AICTE')!.detail).toMatch(/^Receipt AS-26-0417-0091, 507 records, 2 compliance alerts, SHA-256 [0-9a-f]{16}$/)
    expect(find('Sign-in failed')).toMatchObject({ actor: 'Public', detail: 'nodal@aranya-tech.edu.in: wrong password' })
    expect(find('Referred case to Regional Office')).toMatchObject({ category: 'Compliance', actor: 'Meena Iyer' })
    expect(find('Allowed verification')!.detail).toContain('CN-7731 valid 7 days')
    expect(find('Requested consent')!.detail).toContain('APAAR 4471 •••• ••18')
  })

  it('is a gap-free chain the browser can re-verify with the same format', async () => {
    const a = await login('sysadmin@aicte-india.org')
    const trail: TrailEntry[] = (await a.get('/api/aicte/audit/trail')).body
    expect(trail.length).toBeGreaterThan(20)
    let prev = '0'.repeat(64)
    trail.forEach((e, i) => {
      expect(e.seq).toBe(i + 1)
      expect(e.prev).toBe(prev)
      expect(sha([e.seq, e.at, e.actor, e.role, e.org, e.category, e.action, e.detail, e.prev].join('|'))).toBe(e.hash)
      expect(canonical(e)).toBe([e.seq, e.at, e.actor, e.role, e.org, e.category, e.action, e.detail, e.prev].join('|'))
      prev = e.hash
    })
    expect((await a.get('/api/aicte/audit/verify')).body).toMatchObject({ ok: true, entries: trail.length })
  })

  it('numbers entries 1..n with no gaps', async () => {
    const before = (await db.execute<{ n: number }>(sql`select max(seq)::int as n from audit_log`)).rows[0].n
    const n = await login('nodal@aranya-tech.edu.in')
    expect((await n.post('/api/inst/submissions').send({ declaration: true })).status).toBe(201)
    const after = (await db.execute<{ n: number; c: number }>(sql`select max(seq)::int as n, count(*)::int as c from audit_log`)).rows[0]
    expect(after.n).toBe(after.c)
    expect(after.n).toBeGreaterThan(before)
  })

  it('lets the browser add only its own kinds of events, under the signed-in user', async () => {
    const v = await login('kabir.menon@tarangsoftware.in')
    expect((await v.post('/api/audit').send({ category: 'Verification', action: 'Verified certificate', detail: 'GTU/2022/CSE/0417, signature valid', actor: 'Someone else' })).status).toBe(201)
    expect((await v.post('/api/audit').send({ category: 'Reports', action: 'Generated report', detail: 'x' })).status).toBe(403)
    expect((await v.post('/api/audit').send({ category: 'Submission', action: 'Submitted enrolment data to AICTE', detail: 'forged' })).status).toBe(400)
    expect((await request(app).post('/api/audit').send({ category: 'Verification', action: 'x', detail: 'x' })).status).toBe(401)
    const a = await login('sysadmin@aicte-india.org')
    const last: TrailEntry = (await a.get('/api/aicte/audit/trail')).body.at(-2)
    expect(last).toMatchObject({ action: 'Verified certificate', actor: 'Kabir Menon', org: 'Tarang Software Pvt. Ltd.' })
  })

  it('logs a record edit with its note', async () => {
    const n = await login('nodal@aranya-tech.edu.in')
    const rows = (await n.get('/api/inst/state')).body.upload.rows
    const edited = { ...rows[0], NAME: rows[0].NAME }
    await n.put('/api/inst/uploads/current/rows').send({ rows: [edited, ...rows.slice(1)], fixes: 0, note: { action: 'Edited student record', detail: `Row ${edited.rowNo}, ${edited.INST_STUDENT_ID}, ${edited.NAME}` } })
    const a = await login('sysadmin@aicte-india.org')
    const trail: TrailEntry[] = (await a.get('/api/aicte/audit/trail')).body
    expect(trail.some((e) => e.action === 'Edited student record' && e.detail.startsWith(`Row ${edited.rowNo},`))).toBe(true)
  })

  it('detects an edited entry', async () => {
    const a = await login('sysadmin@aicte-india.org')
    await db.update(auditLog).set({ detail: 'Receipt AS-26-0417-0091, 9 records' }).where(eq(auditLog.action, 'Submitted enrolment data to AICTE'))
    const broken = (await a.get('/api/aicte/audit/verify')).body
    expect(broken.ok).toBe(false)
    expect(broken.brokenAt).toBeGreaterThan(0)
  })
})

describe('migration 0002 on audit entries in the old format', () => {
  it('fills in readable fields and rebuilds a valid chain', async () => {
    await db.execute(sql`truncate audit_log`)
    await db.execute(sql`insert into audit_log (seq, at, actor, role, action, entity, entity_id, payload, prev_hash, hash) values
      (3, '2026-10-25T19:00:00.123Z', 'nodal@aranya-tech.edu.in', 'inst_admin', 'auth.login', 'user', 'nodal@aranya-tech.edu.in', '{}', repeat('0',64), repeat('a',64)),
      (7, '2026-10-25T19:01:00.456Z', 'nodal@aranya-tech.edu.in', 'inst_admin', 'submission.create', 'submission', 'AS-26-0417-0091', '{"records": 507}', repeat('a',64), repeat('b',64)),
      (9, '2026-10-25T19:02:00Z', 'ghost@example.com', 'student', 'consent.grant', 'verification_request', 'RQ-1', '{}', repeat('b',64), repeat('c',64))`)
    const file = readFileSync('server/db/migrations/0002_audit_trail_format.sql', 'utf8')
    const backfill = file.slice(file.indexOf('-- Backfill the readable fields'))
    for (const stmt of backfill.split('--> statement-breakpoint')) await db.execute(sql.raw(stmt))

    const a = await login('sysadmin@aicte-india.org')
    const trail: TrailEntry[] = (await a.get('/api/aicte/audit/trail')).body
    expect(trail.slice(0, 3).map((e) => [e.seq, e.actor, e.category, e.action])).toEqual([
      [1, 'Dr. Sunanda Patil', 'Sign-in', 'Signed in'],
      [2, 'Dr. Sunanda Patil', 'Submission', 'Submitted enrolment data to AICTE'],
      [3, 'ghost@example.com', 'Consent', 'Allowed verification'],
    ])
    expect(trail[1].detail).toBe('AS-26-0417-0091, {"records": 507}')
    // the sign-in just above was appended after the rebuilt entries and the whole chain verifies
    expect((await a.get('/api/aicte/audit/verify')).body).toMatchObject({ ok: true, entries: 4 })
  })
})

describe('registrations', () => {
  it('stores student and organisation sign-up requests with a reference', async () => {
    const s = await request(app).post('/api/public/registrations').send({ kind: 'student', apaar: '4471 2093 6618', mobile: '98765 43210' })
    expect(s.status).toBe(201)
    expect(s.body.ref).toBe('REG-2026-10001')
    const o = await request(app).post('/api/public/registrations').send({ kind: 'org', org: 'Acme Hiring', email: 'hr@acme.in', purpose: 'Pre-employment background verification' })
    expect(o.body.ref).toBe('REG-2026-10002')
    expect((await request(app).post('/api/public/registrations').send({ kind: 'student', apaar: '123', mobile: '1' })).status).toBe(400)
    const rows = (await db.execute<{ ref: string; kind: string }>(sql`select ref, kind from registrations order by ref`)).rows
    expect(rows).toEqual([{ ref: 'REG-2026-10001', kind: 'student' }, { ref: 'REG-2026-10002', kind: 'org' }])
    const a = await login('sysadmin@aicte-india.org')
    const trail: TrailEntry[] = (await a.get('/api/aicte/audit/trail')).body
    expect(trail.filter((e) => e.category === 'Registration').map((e) => e.actor)).toEqual(['Student applicant', 'hr@acme.in'])
  })
})

describe('public', () => {
  it('serves a certificate by number', async () => {
    const r = await request(app).get('/api/public/certificates/GTU-2026-CSE-0417')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ certNo: 'GTU-2026-CSE-0417', issuer: { name: 'Godavari Technological University' } })
    // the public summary never carries marks
    expect(JSON.stringify(decodeJwt(r.body.jws))).not.toMatch(/cgpa|8\.42|div/)
    expect((await request(app).get('/api/public/certificates/NOPE')).status).toBe(404)
  })

  it('returns JSON 404 for unknown API routes', async () => {
    const r = await request(app).get('/api/nope')
    expect(r.status).toBe(404)
    expect(r.body.error).toBe('not_found')
  })
})
