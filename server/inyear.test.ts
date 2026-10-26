import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { setup } from './test/helpers'
import { generateDataset } from '../src/inst/data/generate'
import { applyAllFixes, runRules } from '../src/inst/engine/rules'
import { RULE_CONTEXT } from '../src/inst/data/dataset'
import type { UploadRow } from '../src/inst/engine/types'

let ctx: Awaited<ReturnType<typeof setup>>
let rows: UploadRow[]
beforeAll(async () => {
  ctx = await setup()
  rows = applyAllFixes(generateDataset().rows, runRules(generateDataset().rows, RULE_CONTEXT))
})
afterAll(async () => { await ctx.pool.end() })

describe('in-year updates', () => {
  it('needs a submission first', async () => {
    const nodal = await ctx.login('nodal@aranya-tech.edu.in')
    const r = await nodal.post('/api/inst/students/events').send({ type: 'withdrawn', student: 'X', date: '2026-10-01' })
    expect(r.body.error).toBe('not_submitted')
  })

  it('withdraws, corrects a name, admits a lateral entrant, and keeps it all through a resubmission', async () => {
    const nodal = await ctx.login('nodal@aranya-tech.edu.in')
    await nodal.post('/api/inst/uploads').send({ fileName: 'Aranya.xlsx', rows })
    expect((await nodal.post('/api/inst/submissions').send({ declaration: true })).status).toBe(201)

    const linked = rows.filter((r) => /^\d{12}$/.test(r.APAAR_ID.replace(/\s/g, '')))
    const leaver = linked[0]
    const typo = linked[1]
    const w = await nodal.post('/api/inst/students/events').send({ type: 'withdrawn', student: leaver.INST_STUDENT_ID, date: '2026-10-05', note: 'Personal reasons' })
    expect(w.status).toBe(201)
    expect((await nodal.post('/api/inst/students/events').send({ type: 'withdrawn', student: leaver.INST_STUDENT_ID, date: '2026-10-06' })).status).toBe(409)
    expect((await nodal.post('/api/inst/students/events').send({ type: 'name_corrected', student: typo.APAAR_ID.replace(/\s/g, ''), date: '2026-10-05', newName: 'Corrected Name' })).status).toBe(201)

    // a lateral entrant still active elsewhere is refused until released there
    await ctx.db.execute(sql`insert into institutions (pid, name, city, state) values ('1-9003001', 'Konkan Polytechnic', 'Ratnagiri', 'MH') on conflict do nothing`)
    const reg = await ctx.db.execute<{ apaar: string; name: string; dob: string }>(sql`select apaar, name, dob::text as dob from apaar_registry where apaar not in (select apaar from enrolments where apaar is not null) limit 1`)
    const p = reg.rows[0]
    await ctx.db.execute(sql`insert into enrolments (apaar, institution_pid, institution, city, ay, programme, name, name_key, inst_student_id, submission_receipt) values (${p.apaar}, '1-9003001', 'Konkan Polytechnic', 'Ratnagiri', '2026-27', 'Diploma CSE', ${p.name}, '', 'KP-1', 'X')`)
    const lateral = { apaar: p.apaar, name: p.name, dob: p.dob, gender: 'F', category: 'OBC-NCL', programme: rows[0].PROGRAMME }
    const refused = await nodal.post('/api/inst/students/events').send({ type: 'lateral_entry', student: 'ATI/LE/2026/001', date: '2026-10-10', lateral })
    expect(refused.body.error).toBe('active_elsewhere')
    await ctx.db.execute(sql`update enrolments set status = 'transferred' where inst_student_id = 'KP-1'`)
    expect((await nodal.post('/api/inst/students/events').send({ type: 'lateral_entry', student: 'ATI/LE/2026/001', date: '2026-10-10', lateral })).status).toBe(201)

    const check = async () => {
      const { students } = (await nodal.get('/api/inst/students')).body as { students: { instStudentId: string; status: string; name: string; entry: string }[] }
      expect(students.find((s) => s.instStudentId === leaver.INST_STUDENT_ID)!.status).toBe('withdrawn')
      expect(students.find((s) => s.instStudentId === typo.INST_STUDENT_ID)!.name).toBe('Corrected Name')
      expect(students.find((s) => s.instStudentId === 'ATI/LE/2026/001')).toMatchObject({ entry: 'lateral', status: 'active' })
    }
    await check()
    // resubmitting the same Excel file must not undo the changes
    await nodal.post('/api/inst/uploads').send({ fileName: 'Aranya-rev.xlsx', rows })
    expect((await nodal.post('/api/inst/submissions').send({ declaration: true })).status).toBe(201)
    await check()

    const log = (await ctx.db.execute<{ action: string }>(sql`select action from access_log where apaar = ${leaver.APAAR_ID.replace(/\s/g, '')} order by id desc limit 1`)).rows[0]
    expect(log.action).toBe('Recorded: Withdrawn')
    expect((await nodal.get('/api/inst/students')).body.events).toHaveLength(3)
  })
})

describe('statutory reports', () => {
  it('builds NIRF, AISHE and NBA tables that add up to the register', async () => {
    const bureau = await ctx.login('meena.iyer@aicte-india.org')
    const active = (await ctx.db.execute<{ n: number }>(sql`select count(*)::int as n from enrolments e join institutions i on i.pid = e.institution_pid where e.status = 'active' and i.name like 'Aranya%'`)).rows[0].n

    const nirf = (await bureau.get('/api/aicte/reports/nirf')).body
    const h = (name: string) => nirf.header.indexOf(name)
    const mine = nirf.rows.filter((r: string[]) => r[0].startsWith('Aranya'))
    expect(mine.reduce((n: number, r: number[]) => n + r[h('Total students')], 0)).toBe(active)
    for (const r of mine) expect(r[h('Male')] + r[h('Female')] + r[h('Transgender')]).toBe(r[h('Total students')])
    expect(mine.some((r: number[]) => r[h('Outside country')] > 0)).toBe(true)

    const aishe = (await bureau.get('/api/aicte/reports/aishe')).body
    const a = (name: string) => aishe.header.indexOf(name)
    for (const r of aishe.rows) expect(r[a('General')] + r[a('EWS')] + r[a('OBC')] + r[a('SC')] + r[a('ST')]).toBe(r[a('Total')])

    const nba = (await bureau.get('/api/aicte/reports/nba')).body
    const n = (name: string) => nba.header.find((x: string) => x.startsWith(name)) as string
    const cse = nba.rows.find((r: (string | number)[]) => r[0].toString().startsWith('Aranya') && r[nba.header.indexOf(n('N2'))] === 1)
    expect(cse).toBeTruthy()
    const [N, N1, N4] = [n('N ('), n('N1'), n('N4')].map((k) => cse[nba.header.indexOf(k)] as number)
    expect(cse[nba.header.indexOf(n('ER'))]).toBe(Math.round(((N1 + N4) / N) * 1000) / 10)

    const regional = await ctx.login('rahul.kulkarni@aicte-india.org')
    const rr = (await regional.get('/api/aicte/reports/nirf')).body
    expect(rr.rows.every((r: string[]) => ['MH', 'GA'].includes(r[2]))).toBe(true)
    expect((await bureau.get('/api/aicte/reports/xyz')).status).toBe(404)

    // the regional overview loads every officer endpoint scoped to its states
    for (const path of ['/api/aicte/live', '/api/aicte/submissions', '/api/aicte/kpis', '/api/aicte/insights', '/api/aicte/alerts', '/api/aicte/cases']) {
      expect((await regional.get(path)).status, path).toBe(200)
    }
    expect((await regional.get('/api/aicte/live')).body.submission.receiptNo).toBeTruthy()
  })
})
