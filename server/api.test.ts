import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { eq, sql } from 'drizzle-orm'
import type { Express } from 'express'
import { createApp } from './app'
import { createDb, createPool, runMigrations, type Db } from './db/client'
import { seed } from './db/seed'
import { auditLog, users } from './db/schema'
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
    expect(first.counts).toEqual({ total: 509, clean: 481, action: 18, auto: 10 })
    expect(first.fixable).toBe(12)
    expect(first.alerts.map((x) => x.rule).sort()).toEqual(['R06', 'R07', 'R10'])
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
    expect(s.body).toMatchObject({ receiptNo: 'AS-26-0417-0091', records: 507, alerts: 3, status: 'Received' })
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
  it('sees the new live alerts first, followed by the national sample', async () => {
    const a = await login('meena.iyer@aicte-india.org')
    const alerts = (await a.get('/api/aicte/alerts')).body
    expect(alerts).toHaveLength(15)
    expect(alerts.slice(0, 3).every((x: { live?: boolean }) => x.live)).toBe(true)
    expect(alerts[0]).toMatchObject({ institution: 'Aranya Institute of Technology', state: 'MH', receiptNo: 'AS-26-0417-0091' })
    expect(alerts[0].rows.length).toBeGreaterThan(0)

    const live = (await a.get('/api/aicte/live')).body
    expect(live.submission.receiptNo).toBe('AS-26-0417-0091')
    expect(live.alerts).toHaveLength(3)
    expect(live.excess).toBe(3)

    const k = (await a.get('/api/aicte/kpis')).body
    expect(k.submitted).toBe(9846)
    expect(k.records).toBe(2136905 + 507)
  })

  it('scopes a regional officer to their states', async () => {
    const r = await login('rahul.kulkarni@aicte-india.org')
    const alerts = (await r.get('/api/aicte/alerts')).body
    expect(alerts.length).toBe(3)
    expect(alerts.every((x: { state: string }) => ['MH', 'GA'].includes(x.state))).toBe(true)
    const outside = await r.post('/api/aicte/alerts/S-0932-R10/actions').send({ status: 'Reviewed, no action' })
    expect(outside.status).toBe(403)
  })

  it('records case actions and returns the latest per alert', async () => {
    const a = await login('meena.iyer@aicte-india.org')
    await a.post('/api/aicte/alerts/S-0932-R10/actions').send({ status: 'Referred to Regional Office', note: 'Check admissions' })
    await a.post('/api/aicte/alerts/S-0932-R10/actions').send({ status: 'Reviewed, no action', note: '' })
    const cases = (await a.get('/api/aicte/cases')).body
    expect(cases['S-0932-R10']).toMatchObject({ status: 'Reviewed, no action', by: 'Meena Iyer' })
    expect((await a.post('/api/aicte/alerts/S-0932-R10/actions').send({ status: 'Closed' })).status).toBe(400)
  })

  it('finds the cross-institution ring', async () => {
    const a = await login('meena.iyer@aicte-india.org')
    const rings = (await a.get('/api/aicte/rings')).body
    expect(rings).toHaveLength(1)
    expect(rings[0]).toMatchObject({ students: 1 })
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

  it('stops duplicate pending requests and unknown students', async () => {
    const v = await login('kabir.menon@tarangsoftware.in')
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

describe('audit log', () => {
  it('is hash-chained and detects tampering', async () => {
    const a = await login('sysadmin@aicte-india.org')
    const ok = (await a.get('/api/aicte/audit/verify')).body
    expect(ok.ok).toBe(true)
    expect(ok.entries).toBeGreaterThan(20)
    expect((await a.get('/api/aicte/audit?limit=5')).body).toHaveLength(5)

    await db.update(auditLog).set({ payload: { forged: true } }).where(eq(auditLog.action, 'submission.create'))
    const broken = (await a.get('/api/aicte/audit/verify')).body
    expect(broken.ok).toBe(false)
    expect(broken.brokenAt).toBeGreaterThan(0)
  })
})

describe('public', () => {
  it('serves a certificate by number', async () => {
    const r = await request(app).get('/api/public/certificates/GTU-2026-CSE-0417')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ certNo: 'GTU-2026-CSE-0417', revoked: false })
    expect((await request(app).get('/api/public/certificates/NOPE')).status).toBe(404)
  })

  it('returns JSON 404 for unknown API routes', async () => {
    const r = await request(app).get('/api/nope')
    expect(r.status).toBe(404)
    expect(r.body.error).toBe('not_found')
  })
})
