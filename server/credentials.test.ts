import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { gunzipSync } from 'node:zlib'
import { compactVerify, decodeJwt, importJWK, type JWK } from 'jose'
import { sql } from 'drizzle-orm'
import { setup } from './test/helpers'
import { generateDataset } from '../src/inst/data/generate'
import { applyAllFixes, runRules } from '../src/inst/engine/rules'
import { RULE_CONTEXT } from '../src/inst/data/dataset'
import { upgradeSeed } from './db/seed'

let ctx: Awaited<ReturnType<typeof setup>>
beforeAll(async () => { ctx = await setup() })
afterAll(async () => { await ctx.pool.end() })

async function verifyWithRegistry(jws: string) {
  const registry = (await request(ctx.app).get('/api/public/issuers')).body as { kid: string; jwk: JWK; status: string }[]
  const kid = JSON.parse(Buffer.from(jws.split('.')[0], 'base64url').toString()).kid
  const entry = registry.find((i) => i.kid === kid)!
  const { payload } = await compactVerify(jws, await importJWK(entry.jwk, 'ES256'))
  return JSON.parse(new TextDecoder().decode(payload))
}

async function isRevoked(credential: { vc: { credentialStatus: { statusListIndex: string; statusListCredential: string } } }) {
  const path = new URL(credential.vc.credentialStatus.statusListCredential, 'http://x').pathname
  const { jws } = (await request(ctx.app).get(path)).body
  const list = await verifyWithRegistry(jws)
  const bits = gunzipSync(Buffer.from(list.vc.credentialSubject.encodedList.slice(1), 'base64url'))
  const i = Number(credential.vc.credentialStatus.statusListIndex)
  return (bits[i >> 3] & (0x80 >> (i & 7))) !== 0
}

describe('issuer registry and the demo degree', () => {
  it('publishes the university key and signs the demo degree with it', async () => {
    const reg = (await request(ctx.app).get('/api/public/issuers')).body
    expect(reg).toHaveLength(1)
    expect(reg[0]).toMatchObject({ did: 'did:web:godavaritu.edu.in', short: 'GTU', status: 'registered' })
    expect(reg[0].jwk).not.toHaveProperty('d')
    const pub = (await request(ctx.app).get('/api/public/c/GTU-2026-CSE-0417')).body
    const vc = await verifyWithRegistry(pub.jws)
    expect(vc.vc.credentialSubject).toEqual({ apaar: '447120936618', sid: 'GTU/2022/CSE/0417', name: 'Ritika Deshmukh', degree: 'B.Tech, Computer Science & Engineering', year: 2026 })
    expect(vc.vc.credentialStatus).toMatchObject({ type: 'BitstringStatusListEntry', statusPurpose: 'revocation', statusListIndex: '417' })
    expect(await isRevoked(vc)).toBe(false)
  })

  it('shows the full certificate only to the holder, the issuing university and AICTE', async () => {
    const student = await ctx.login('447120936618')
    const full = (await student.get('/api/credentials/GTU-2026-CSE-0417')).body
    expect(full).toMatchObject({ cgpa: '8.42', division: 'First Class with Distinction', verifyPath: '/c/GTU-2026-CSE-0417' })
    expect(decodeJwt(full.jws).vc).toMatchObject({ credentialSubject: { cgpa: '8.42' } })
    expect((await (await ctx.login('registrar@godavaritu.edu.in')).get('/api/credentials/GTU-2026-CSE-0417')).status).toBe(200)
    expect((await (await ctx.login('kabir.menon@tarangsoftware.in')).get('/api/credentials/GTU-2026-CSE-0417')).status).toBe(403)
    expect((await (await ctx.login('nodal@aranya-tech.edu.in')).get('/api/credentials/GTU-2026-CSE-0417')).status).toBe(403)
    expect((await request(ctx.app).get('/api/credentials/GTU-2026-CSE-0417')).status).toBe(401)
  })
})

describe('university', () => {
  it('sees affiliated students with registry-checked APAAR IDs and exports the printable ones', async () => {
    // Aranya submits so the register has students
    const rows = generateDataset().rows
    const fixed = applyAllFixes(rows, runRules(rows, RULE_CONTEXT))
    const nodal = await ctx.login('nodal@aranya-tech.edu.in')
    await nodal.post('/api/inst/uploads').send({ fileName: 'Aranya.xlsx', rows: fixed })
    expect((await nodal.post('/api/inst/submissions').send({ declaration: true })).status).toBe(201)

    const uni = await ctx.login('registrar@godavaritu.edu.in')
    const me = (await uni.get('/api/university/me')).body
    expect(me.institutions.map((i: { pid: string }) => i.pid)).toEqual(['1-9000417'])
    const list = (await uni.get('/api/university/students')).body as { apaarStatus: string; printable: boolean }[]
    expect(list.length).toBe(507)
    expect(list.filter((s) => s.apaarStatus === 'No APAAR ID (exception code)').length).toBe(6)
    expect(list.filter((s) => s.printable).length).toBe(501)
    const csv = await uni.get('/api/university/students.csv')
    expect(csv.headers['content-type']).toMatch(/text\/csv/)
    const lines = csv.text.trim().split('\r\n')
    expect(lines).toHaveLength(502)
    expect(lines[0]).toContain('APAAR ID (print format)')
    expect(lines[1]).toMatch(/^\d{12},\d{4} \d{4} \d{4},ARN26/)
    expect((await uni.get('/api/university/students?q=ARN26CSE001')).body).toHaveLength(1)
  })

  it('issues a degree that verifies, refuses bad data, and revokes it', async () => {
    const uni = await ctx.login('registrar@godavaritu.edu.in')
    const [s] = (await ctx.db.execute<{ apaar: string; name: string }>(sql`select apaar, name from enrolments where apaar is not null order by apaar limit 1`)).rows
    const body = { apaar: s.apaar, holderName: s.name, studentId: 'GTU/2026/CSE/1001', programmeCode: 'CSE', degree: 'B.Tech, Computer Science & Engineering', year: 2030, cgpa: '7.9', division: 'First Class', institutionPid: '1-9000417' }

    expect((await uni.post('/api/university/credentials').send({ ...body, holderName: 'Someone Else' })).body.error).toBe('name_mismatch')
    expect((await uni.post('/api/university/credentials').send({ ...body, apaar: '999999999999' })).body.error).toBe('apaar_not_found')
    expect((await uni.post('/api/university/credentials').send({ ...body, cgpa: '11' })).status).toBe(400)
    expect((await uni.post('/api/university/credentials').send({ ...body, institutionPid: '1-9000932' })).status).toBe(403)

    const issued = await uni.post('/api/university/credentials').send(body)
    expect(issued.status).toBe(201)
    expect(issued.body.certNo).toBe('GTU-2030-CSE-0001')
    expect((await uni.post('/api/university/credentials').send(body)).body.error).toBe('already_issued')

    const pub = (await request(ctx.app).get(`/api/public/c/${issued.body.certNo}`)).body
    const vc = await verifyWithRegistry(pub.jws)
    expect(vc.vc.credentialSubject.name).toBe(s.name)
    expect(await isRevoked(vc)).toBe(false)

    expect((await uni.post(`/api/university/credentials/${issued.body.certNo}/revoke`).send({ reason: 'Issued with wrong programme' })).status).toBe(200)
    expect(await isRevoked(vc)).toBe(true)
    // the demo degree is unaffected
    const demo = await verifyWithRegistry((await request(ctx.app).get('/api/public/c/GTU-2026-CSE-0417')).body.jws)
    expect(await isRevoked(demo)).toBe(false)
  })

  it('is closed to other roles', async () => {
    expect((await (await ctx.login('nodal@aranya-tech.edu.in')).get('/api/university/students')).status).toBe(403)
  })
})

describe('consented marks', () => {
  it('shares CGPA with a verifier only when the student allowed marks', async () => {
    const v = await ctx.login('kabir.menon@tarangsoftware.in')
    const s = await ctx.login('447120936618')
    const basic = (await v.post('/api/verifier/requests').send({ apaar: '447120936618', purpose: 'Pre-employment background verification', reference: 'OL/1', validityDays: 7 })).body
    expect(basic.fields).toEqual(['basic'])
    await s.post(`/api/student/requests/${basic.id}/decide`).send({ status: 'Approved' })
    const r1 = (await v.get('/api/verifier/records/447120936618')).body
    expect(r1).not.toHaveProperty('cgpa')
    await s.post(`/api/student/requests/${basic.id}/revoke`)

    const marks = (await v.post('/api/verifier/requests').send({ apaar: '447120936618', purpose: 'Admission to a higher education programme', reference: 'PG-1', validityDays: 7, fields: ['marks'] })).body
    expect(marks.fields).toEqual(['basic', 'marks'])
    await s.post(`/api/student/requests/${marks.id}/decide`).send({ status: 'Approved' })
    const r2 = (await v.get('/api/verifier/records/447120936618')).body
    expect(r2).toMatchObject({ cgpa: '8.42', division: 'First Class with Distinction' })
  })
})

describe('upgrading a database seeded by an earlier version', () => {
  it('adds the issuer, missing accounts and re-issues the demo degree, once', async () => {
    await ctx.db.execute(sql`delete from users where role in ('university', 'regulator')`)
    await ctx.db.execute(sql`update credentials set public_jws = null where cert_no = 'GTU-2026-CSE-0417'`)
    const first = await upgradeSeed(ctx.db)
    expect(first.upgraded).toEqual(['accounts:university,regulator', 'demo-degree'])
    expect((await upgradeSeed(ctx.db)).upgraded).toEqual([])
    const pub = (await request(ctx.app).get('/api/public/c/GTU-2026-CSE-0417')).body
    expect((await verifyWithRegistry(pub.jws)).jti).toBe('GTU-2026-CSE-0417')
  })
})
