import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { generateDataset } from '../src/inst/data/generate'
import type { UploadRow } from '../src/inst/engine/types'
import { setup } from './test/helpers'

let ctx: Awaited<ReturnType<typeof setup>>
let key = ''
const PID = '1-9000417'
const rows = generateDataset().rows

const toApi = (r: UploadRow) => ({
  apaarId: r.APAAR_ID, apaarException: r.APAAR_EXCEPTION, instStudentId: r.INST_STUDENT_ID, name: r.NAME, dob: r.DOB,
  gender: r.GENDER, category: r.CATEGORY, programme: r.PROGRAMME, quota: r.QUOTA, nri: r.NRI, oci: r.OCI, ociCardNo: r.OCI_CARD_NO,
  fn: r.FN, nationality: r.NATIONALITY, admissionDate: r.ADMISSION_DATE,
})

beforeAll(async () => { ctx = await setup() })
afterAll(async () => { await ctx.pool.end() })

describe('API keys', () => {
  it('only the nodal officer can create one; the secret is shown once', async () => {
    const op = await ctx.login('operator@aranya-tech.edu.in')
    expect((await op.post('/api/inst/api-keys').send({ name: 'ERP' })).status).toBe(403)
    const nodal = await ctx.login('nodal@aranya-tech.edu.in')
    const r = await nodal.post('/api/inst/api-keys').send({ name: 'Campus ERP' })
    expect(r.status).toBe(201)
    expect(r.body.key).toMatch(/^apaar_[0-9a-f]{12}_[A-Za-z0-9_-]{20,}$/)
    key = r.body.key
    const list = (await op.get('/api/inst/api-keys')).body
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'Campus ERP', scope: 'institution' })
    expect(JSON.stringify(list)).not.toContain(key.split('_')[2])
  })

  it('rejects missing, malformed and unknown keys', async () => {
    const url = `/api/v1/institutions/${PID}/enrolments/validation`
    expect((await request(ctx.app).get(url)).body.error).toBe('api_key_required')
    expect((await request(ctx.app).get(url).set('Authorization', 'Bearer apaar_nope')).body.error).toBe('invalid_api_key')
    expect((await request(ctx.app).get(url).set('X-API-Key', 'apaar_000000000000_aaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(401)
    // a session cookie is not an API key
    const nodal = await ctx.login('nodal@aranya-tech.edu.in')
    expect((await nodal.get(url)).status).toBe(401)
  })
})

describe('batch endpoint', () => {
  const auth = () => ({ Authorization: `Bearer ${key}` })

  it('replace + append in batches of up to 1,000, same results as an Excel upload', async () => {
    const first = await request(ctx.app).post(`/api/v1/institutions/${PID}/enrolments:batch`).set(auth())
      .send({ academicYear: '2026-27', mode: 'replace', records: rows.slice(0, 300).map(toApi) })
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ mode: 'replace', received: 300, totalRows: 300 })

    const second = await request(ctx.app).post(`/api/v1/institutions/${PID}/enrolments/batch`).set(auth())
      .send({ academicYear: '2026-27', mode: 'append', records: rows.slice(300).map(toApi) })
    expect(second.body).toMatchObject({ received: 209, totalRows: 509, readyToSubmit: false })
    // identical to the portal's numbers for the sample file
    expect(second.body.summary.counts).toEqual({ total: 509, clean: 482, action: 17, auto: 10 })
    expect(second.body.summary.fixable).toBe(12)
    // issues only cover rows from this batch
    expect(second.body.issues.every((i: { rowNo: number }) => i.rowNo > 301)).toBe(true)

    // and the nodal officer sees the same data in the portal
    const nodal = await ctx.login('nodal@aranya-tech.edu.in')
    const state = (await nodal.get('/api/inst/state')).body
    expect(state.upload.rows).toHaveLength(509)
  })

  it('replays the stored response for a repeated Idempotency-Key', async () => {
    const send = () => request(ctx.app).post(`/api/v1/institutions/${PID}/enrolments:batch`).set(auth()).set('Idempotency-Key', 'erp-2026-07-30-001')
      .send({ academicYear: '2026-27', mode: 'append', records: [toApi(rows[0])] })
    const a = await send()
    const b = await send()
    expect(b.headers['idempotent-replayed']).toBe('true')
    expect(b.body).toEqual(a.body)
    expect(a.body.totalRows).toBe(510)
  })

  it('validates record shape and explains each problem', async () => {
    const r = await request(ctx.app).post(`/api/v1/institutions/${PID}/enrolments:batch`).set(auth())
      .send({ academicYear: '2026-27', records: [{ ...toApi(rows[0]), dob: '15/07/2008', quota: 'VIP' }] })
    expect(r.status).toBe(400)
    const paths = r.body.details.map((d: { path: (string | number)[] }) => d.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['records.0.dob', 'records.0.quota']))
    expect((await request(ctx.app).post(`/api/v1/institutions/${PID}/enrolments:batch`).set(auth())
      .send({ academicYear: '2026-27', records: Array.from({ length: 1001 }, () => toApi(rows[0])) })).status).toBe(400)
  })

  it('cannot act for another institution', async () => {
    const r = await request(ctx.app).get('/api/v1/institutions/1-9000932/enrolments/validation').set(auth())
    expect(r.status).toBe(403)
  })

  it('looks up one student by APAAR ID or student ID', async () => {
    const r = await request(ctx.app).get(`/api/v1/institutions/${PID}/students/${rows[5].INST_STUDENT_ID}`).set(auth())
    expect(r.status).toBe(200)
    expect(r.body.row.NAME).toBe(rows[5].NAME)
  })

  it('records API activity in the audit trail under the key', async () => {
    const admin = await ctx.login('sysadmin@aicte-india.org')
    const trail = (await admin.get('/api/aicte/audit/trail')).body as { action: string; role: string; actor: string }[]
    const api = trail.filter((e) => e.action === 'Received enrolment batch by API')
    expect(api.length).toBeGreaterThanOrEqual(3)
    expect(api[0]).toMatchObject({ role: 'API client', actor: 'API key Campus ERP' })
  })

  it('stops working once revoked', async () => {
    const nodal = await ctx.login('nodal@aranya-tech.edu.in')
    const id = key.split('_')[1]
    expect((await nodal.delete(`/api/inst/api-keys/${id}`)).status).toBe(204)
    const r = await request(ctx.app).get(`/api/v1/institutions/${PID}/enrolments/validation`).set(auth())
    expect(r.body.error).toBe('revoked_api_key')
  })
})

describe('AICTE approvals import', () => {
  it('needs an AICTE system key and upserts institutions and approved intake', async () => {
    const admin = await ctx.login('sysadmin@aicte-india.org')
    const k = (await admin.post('/api/aicte/api-keys').send({ name: 'AICTE approval portal' })).body.key
    const body = {
      academicYear: '2026-27',
      institutions: [{ pid: '1-9000932', name: 'Meghavarsha Institute of Technology', city: 'Bhopal', state: 'MP',
        programmes: [{ code: 'CSE', label: 'B.Tech CSE', name: 'B.Tech Computer Science & Engineering', intake: 120, lastYearAdmitted: 73 }] }],
    }
    const r = await request(ctx.app).post('/api/v1/aicte/approvals').set('Authorization', `Bearer ${k}`).send(body)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ institutions: 1, programmes: 1 })
    // an institution key cannot do this
    const nodal = await ctx.login('nodal@aranya-tech.edu.in')
    const ik = (await nodal.post('/api/inst/api-keys').send({ name: 'ERP 2' })).body.key
    expect((await request(ctx.app).post('/api/v1/aicte/approvals').set('Authorization', `Bearer ${ik}`).send(body)).status).toBe(403)
    const rows = (await ctx.db.execute<{ intake: number; last_year_admitted: number }>(
      'select intake, last_year_admitted from programmes where institution_pid = \'1-9000932\' and code = \'CSE\'' as never)).rows
    expect(rows).toEqual([{ intake: 120, last_year_admitted: 73 }])
  })
})

describe('OpenAPI', () => {
  it('serves a 3.1 spec whose schemas come from the server validators', async () => {
    const r = await request(ctx.app).get('/api/openapi.json')
    expect(r.body.openapi).toBe('3.1.0')
    expect(Object.keys(r.body.paths)).toContain('/institutions/{pid}/enrolments:batch')
    const rec = r.body.components.schemas.EnrolmentBatch.properties.records.items
    expect(rec.properties.quota.enum).toContain('PM-USPY')
    expect(rec.required).toEqual(expect.arrayContaining(['instStudentId', 'name', 'dob']))
  })
})
