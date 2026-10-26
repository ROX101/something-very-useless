import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { sql } from 'drizzle-orm'
import { approveWithOtp, setup } from './test/helpers'
import { generateDataset } from '../src/inst/data/generate'
import { applyAllFixes, runRules } from '../src/inst/engine/rules'
import { RULE_CONTEXT } from '../src/inst/data/dataset'

let ctx: Awaited<ReturnType<typeof setup>>
const APAAR = '447120936618'
beforeAll(async () => { ctx = await setup() })
afterAll(async () => { await ctx.pool.end() })

describe('one-time passwords for consent', () => {
  it('rejects wrong, reused and expired codes, and locks after five tries', async () => {
    const v = await ctx.login('kabir.menon@tarangsoftware.in')
    const s = await ctx.login(APAAR)
    const rq = (await v.post('/api/verifier/requests').send({ apaar: APAAR, purpose: 'Employment verification', validityDays: 7 })).body
    const sent = (await s.post(`/api/student/requests/${rq.id}/otp`)).body
    expect(sent.sentTo).toBe('+91 ••••• ••321')
    expect(sent.demoCode).toMatch(/^\d{6}$/)
    const wrong = sent.demoCode === '000000' ? '111111' : '000000'
    const bad = await s.post(`/api/student/requests/${rq.id}/decide`).send({ status: 'Approved', otp: wrong })
    expect(bad.body).toMatchObject({ error: 'otp_wrong', message: 'Incorrect code. 4 attempts left.' })

    // a new code replaces the old one
    const again = (await s.post(`/api/student/requests/${rq.id}/otp`)).body
    if (again.demoCode !== sent.demoCode) expect((await s.post(`/api/student/requests/${rq.id}/decide`).send({ status: 'Approved', otp: sent.demoCode })).body.error).toBe('otp_wrong')

    await ctx.db.execute(sql`update otps set expires_at = now() - interval '1 second' where used_at is null`)
    expect((await s.post(`/api/student/requests/${rq.id}/decide`).send({ status: 'Approved', otp: again.demoCode })).body.error).toBe('otp_expired')

    const third = (await s.post(`/api/student/requests/${rq.id}/otp`)).body
    const other = third.demoCode === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) await s.post(`/api/student/requests/${rq.id}/decide`).send({ status: 'Approved', otp: other })
    expect((await s.post(`/api/student/requests/${rq.id}/decide`).send({ status: 'Approved', otp: third.demoCode })).body.error).toBe('otp_missing')

    // refusing needs no code
    expect((await s.post(`/api/student/requests/${rq.id}/decide`).send({ status: 'Refused' })).body.status).toBe('Refused')
    const stored = await ctx.db.execute<{ code_hash: string }>(sql`select code_hash from otps`)
    expect(stored.rows.every((r) => /^[0-9a-f]{64}$/.test(r.code_hash))).toBe(true)
  })
})

describe('retention and erasure (DPDP s.8(7))', () => {
  it('starts the clock at first view, flags overdue erasure, and records the confirmation', async () => {
    const v = await ctx.login('kabir.menon@tarangsoftware.in')
    const s = await ctx.login(APAAR)
    const rq = (await v.post('/api/verifier/requests').send({ apaar: APAAR, purpose: 'Employment verification', validityDays: 7, retentionDays: 30 })).body
    expect((await v.post(`/api/verifier/requests/${rq.id}/erased`)).body.error).toBe('not_viewed')
    await approveWithOtp(s, rq.id)
    await v.get(`/api/verifier/records/${APAAR}`)
    let mine = (await v.get('/api/verifier/requests')).body.find((r: { id: string }) => r.id === rq.id)
    expect(Date.parse(mine.eraseBy) - Date.parse(mine.firstViewedAt)).toBe(30 * 86400000)
    expect(mine.eraseOverdue).toBe(false)

    // revoking consent brings the deadline forward to now
    await s.post(`/api/student/requests/${rq.id}/revoke`)
    await ctx.db.execute(sql`update verification_requests set erase_by = now() - interval '1 day' where id = ${rq.id}`)
    mine = (await v.get('/api/verifier/requests')).body.find((r: { id: string }) => r.id === rq.id)
    expect(mine.eraseOverdue).toBe(true)

    const done = (await v.post(`/api/verifier/requests/${rq.id}/erased`)).body
    expect(done.erasedAt).toBeTruthy()
    expect(done.eraseOverdue).toBe(false)
    expect((await s.get('/api/student/log')).body[0].action).toMatch(/^Confirmed it erased your data received under CN-\d+ \(after the deadline\)$/)
    expect((await v.post(`/api/verifier/requests/${rq.id}/erased`)).status).toBe(409)
  })
})

describe('regulator statutory access', () => {
  it('needs a legal basis, logs each student, and ends on time', async () => {
    const nodal = await ctx.login('nodal@aranya-tech.edu.in')
    const rows = applyAllFixes(generateDataset().rows, runRules(generateDataset().rows, RULE_CONTEXT))
    await nodal.post('/api/inst/uploads').send({ fileName: 'Aranya.xlsx', rows })
    expect((await nodal.post('/api/inst/submissions').send({ declaration: true })).status).toBe(201)

    const reg = await ctx.login('assessor@naac.gov.in')
    const inst = (await reg.get('/api/regulator/institutions')).body.find((i: { name: string }) => /Aranya/.test(i.name))
    expect((await reg.post('/api/regulator/access').send({ institutionPid: inst.pid, basis: 'Curiosity', reference: 'x' })).status).toBe(400)
    const g = await reg.post('/api/regulator/access').send({ institutionPid: inst.pid, basis: 'NAAC assessment and accreditation', reference: 'NAAC/SSR/2026/MH/0412', days: 7 })
    expect(g.status).toBe(201)
    expect(g.body).toMatchObject({ id: 'SA-501', active: true })

    const roster = (await reg.get(`/api/regulator/access/${g.body.id}/students`)).body
    expect(roster.students.length).toBe(rows.length)
    const linked = roster.students.find((x: { apaar: string | null }) => x.apaar)
    const logs = await ctx.db.execute<{ n: number }>(sql`select count(*)::int as n from access_log where action like '%NAAC/SSR/2026/MH/0412%'`)
    expect(logs.rows[0].n).toBe(new Set(roster.students.filter((x: { apaar: string | null }) => x.apaar).map((x: { apaar: string }) => x.apaar)).size)
    // reading the roster again does not spam each student's log
    await reg.get(`/api/regulator/access/${g.body.id}/students`)
    const again = await ctx.db.execute<{ n: number }>(sql`select count(*)::int as n from access_log where action like '%NAAC/SSR/2026/MH/0412%'`)
    expect(again.rows[0].n).toBe(logs.rows[0].n)

    const one = await reg.get(`/api/regulator/access/${g.body.id}/students/${linked.apaar}`)
    expect(one.status).toBe(200)
    expect(one.body.enrolments[0].programme).toBeTruthy()

    const audit = (await (await ctx.login('meena.iyer@aicte-india.org')).get('/api/aicte/audit')).body as { action: string }[]
    expect(audit.some((a) => a.action === 'Opened statutory access')).toBe(true)

    await ctx.db.execute(sql`update statutory_access set expires_at = now() - interval '1 second'`)
    expect((await reg.get(`/api/regulator/access/${g.body.id}/students`)).status).toBe(403)
    expect((await (await ctx.login('kabir.menon@tarangsoftware.in')).get('/api/regulator/access')).status).toBe(403)
  })
})

describe('institution prior-enrolment check', () => {
  it('confirms the APAAR ID, matches the name, shows active enrolment elsewhere, and tells the student', async () => {
    await ctx.db.execute(sql`insert into institutions (pid, name, city, state) values ('1-9002001', 'Sahyadri Institute of Technology', 'Pune', 'MH') on conflict do nothing`)
    await ctx.db.execute(sql`insert into enrolments (apaar, institution_pid, institution, city, ay, programme, name, name_key, submission_receipt) values (${APAAR}, '1-9002001', 'Sahyadri Institute of Technology', 'Pune', '2026-27', 'M.Tech CSE', 'Ritika Deshmukh', '', 'X')`)
    const nodal = await ctx.login('nodal@aranya-tech.edu.in')
    const r = (await nodal.get(`/api/inst/verify/${APAAR}?name=ritika%20deshmukh&dob=2004-03-14`)).body
    expect(r).toMatchObject({ found: true, name: 'Ritika Deshmukh', nameMatches: true, dobMatches: true })
    expect(r.activeElsewhere).toEqual([expect.objectContaining({ institution: 'Sahyadri Institute of Technology', status: 'active' })])
    expect((await (await ctx.login(APAAR)).get('/api/student/log')).body[0].action).toBe('Checked your APAAR ID and prior enrolments before admission')
    expect((await nodal.get('/api/inst/verify/123412341234')).body).toMatchObject({ found: false, activeElsewhere: [] })
  })
})

describe('onboarding', () => {
  it('approves a verifier with a one-time password that must be changed', async () => {
    const pub = request(ctx.app)
    const sent = await pub.post('/api/public/registrations').send({ kind: 'org', org: 'Nirmaan Infra Ltd', email: 'hr@nirmaaninfra.in', purpose: 'Hiring' })
    expect(sent.status).toBe(201)
    const ref = sent.body.ref
    const admin = await ctx.login('sysadmin@aicte-india.org')
    const list = (await admin.get('/api/aicte/registrations')).body
    expect(list[0]).toMatchObject({ ref, status: 'Received', org: 'Nirmaan Infra Ltd' })
    const ok = (await admin.post(`/api/aicte/registrations/${ref}/decide`).send({ decision: 'Approved' })).body
    expect(ok.registration).toMatchObject({ status: 'Approved', userId: 'hr@nirmaaninfra.in' })
    expect(ok.tempPassword).toMatch(/^.{12}$/)
    expect((await admin.post(`/api/aicte/registrations/${ref}/decide`).send({ decision: 'Approved' })).status).toBe(409)

    const agent = request.agent(ctx.app)
    const login = await agent.post('/api/auth/login').send({ userId: 'hr@nirmaaninfra.in', password: ok.tempPassword })
    expect(login.body.account).toMatchObject({ role: 'verifier', org: 'Nirmaan Infra Ltd', mustChangePassword: true })
    expect((await agent.post('/api/auth/password').send({ current: ok.tempPassword, next: 'short1' })).status).toBe(400)
    const changed = await agent.post('/api/auth/password').send({ current: ok.tempPassword, next: 'Nirmaan-Verify-2026' })
    expect(changed.body.account.mustChangePassword).toBeUndefined()
    expect((await agent.get('/api/verifier/requests')).status).toBe(200)
  })

  it('creates a student account only for a known APAAR ID', async () => {
    const pub = request(ctx.app)
    const admin = await ctx.login('sysadmin@aicte-india.org')
    const unknown = (await pub.post('/api/public/registrations').send({ kind: 'student', apaar: '999988887777', mobile: '9876543210' })).body.ref
    expect((await admin.post(`/api/aicte/registrations/${unknown}/decide`).send({ decision: 'Approved' })).body.error).toBe('apaar_unknown')
    expect((await admin.post(`/api/aicte/registrations/${unknown}/decide`).send({ decision: 'Rejected', note: 'APAAR ID not found' })).body.registration.status).toBe('Rejected')

    const known = await ctx.db.execute<{ apaar: string; name: string }>(sql`select apaar, name from apaar_registry where apaar <> ${APAAR} and apaar not in (select user_id from users) limit 1`)
    const ref = (await pub.post('/api/public/registrations').send({ kind: 'student', apaar: known.rows[0].apaar, mobile: '9876543210' })).body.ref
    const ok = (await admin.post(`/api/aicte/registrations/${ref}/decide`).send({ decision: 'Approved' })).body
    const agent = request.agent(ctx.app)
    const login = await agent.post('/api/auth/login').send({ userId: known.rows[0].apaar, password: ok.tempPassword })
    expect(login.body.account).toMatchObject({ role: 'student', name: known.rows[0].name })
    expect((await (await ctx.login('nodal@aranya-tech.edu.in')).get('/api/aicte/registrations')).status).toBe(403)
  })
})
