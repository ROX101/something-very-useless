import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { setup } from './test/helpers'
import { anomalies, modifiedZ } from './services/anomalies'
import { generateDataset } from '../src/inst/data/generate'
import { applyAllFixes, runRules } from '../src/inst/engine/rules'
import { RULE_CONTEXT } from '../src/inst/data/dataset'
import { enrolments, institutions, programmes, submissions, uploads } from './db/schema'
import type { SubmissionSnapshot } from './db/schema'

let ctx: Awaited<ReturnType<typeof setup>>
beforeAll(async () => { ctx = await setup() })
afterAll(async () => { await ctx.pool.end() })

describe('modified z-score', () => {
  it('flags only the outlier', () => {
    const xs = [0.1, 0.12, 0.09, 0.11, 0.1, 0.6]
    expect(modifiedZ(0.6, xs).z).toBeGreaterThan(3.5)
    expect(modifiedZ(0.12, xs).z).toBeLessThan(3.5)
  })
})

describe('R11 probable duplicates', () => {
  it('flags a student enrolled elsewhere under a different APAAR ID, in the preview and on submission', async () => {
    const rows = applyAllFixes(generateDataset().rows, runRules(generateDataset().rows, RULE_CONTEXT))
    const target = rows.find((r) => r.QUOTA === 'REGULAR' && r.PROGRAMME === 'B.Tech CSE')!
    await ctx.db.insert(institutions).values({ pid: '1-9001105', name: 'Trivikram College of Engineering', city: 'Raipur', state: 'CG' })
    // same person, typed slightly differently, under another APAAR ID
    await ctx.db.insert(enrolments).values({
      apaar: '111122223333', institutionPid: '1-9001105', institution: 'Trivikram College of Engineering', city: 'Raipur', ay: '2026-27',
      programme: 'B.Tech CSE', name: target.NAME.toUpperCase().replace(' ', '  '), nameKey: '', dob: target.DOB, gender: target.GENDER, submissionReceipt: 'X',
    })
    // a different person who only shares the birthday
    await ctx.db.insert(enrolments).values({
      apaar: '111122224444', institutionPid: '1-9001105', institution: 'Trivikram College of Engineering', city: 'Raipur', ay: '2026-27',
      programme: 'B.Tech CSE', name: 'Zubin Fernandes', nameKey: '', dob: target.DOB, gender: target.GENDER, submissionReceipt: 'X',
    })

    const nodal = await ctx.login('nodal@aranya-tech.edu.in')
    const up = (await nodal.post('/api/inst/uploads').send({ fileName: 'Aranya.xlsx', rows })).body
    expect(up.probable.length).toBe(2)
    const r11 = up.result.alerts.filter((a: { rule: string }) => a.rule === 'R11')
    expect(r11).toHaveLength(1)
    expect(r11[0]).toMatchObject({ title: '1 probable duplicate with Trivikram College of Engineering, Raipur' })
    expect(up.result.rows.find((x: { row: { rowNo: number } }) => x.row.rowNo === target.rowNo).flags.some((f: { rule: string }) => f.rule === 'R11')).toBe(true)

    expect((await nodal.post('/api/inst/submissions').send({ declaration: true })).status).toBe(201)
    const bureau = await ctx.login('meena.iyer@aicte-india.org')
    const alerts = (await bureau.get('/api/aicte/alerts')).body as { rule: string }[]
    expect(alerts.filter((a) => a.rule === 'R11')).toHaveLength(1)
    const ins = (await bureau.get('/api/aicte/insights')).body
    const ring = ins.rings.find((x: { to: { pid: string }; from: { pid: string } }) => [x.from.pid, x.to.pid].includes('1-9001105'))
    expect(ring.students).toHaveLength(0)
    expect(ring.probable).toHaveLength(1)
    expect(ring.probable[0].similarity).toBeGreaterThanOrEqual(0.92)
  })
})

describe('statistical anomalies', () => {
  it('flags the institution far from its peers, with the reason and method', async () => {
    // five ordinary institutions and one with heavy last-week admissions and many missing APAAR IDs
    const mk = (n: number, lateShare: number, missing: number): SubmissionSnapshot['rows'] => Array.from({ length: n }, (_, i) => ({
      rowNo: i + 2, NAME: `S${i}`, INST_STUDENT_ID: `X${i}`, PROGRAMME: 'B.Tech CSE', APAAR_ID: i < missing ? '' : String(100000000000 + i),
      APAAR_EXCEPTION: i < missing ? 'GENERATION_PENDING' : '', QUOTA: 'REGULAR', ADMISSION_DATE: i < n * lateShare ? '2026-09-08' : '2026-07-20',
    }))
    const peers = [
      { pid: '1-9100001', late: 0.05, miss: 2 }, { pid: '1-9100002', late: 0.08, miss: 3 }, { pid: '1-9100003', late: 0.06, miss: 2 },
      { pid: '1-9100004', late: 0.07, miss: 1 }, { pid: '1-9100005', late: 0.05, miss: 2 }, { pid: '1-9100006', late: 0.7, miss: 30 },
    ]
    for (const p of peers) {
      await ctx.db.insert(institutions).values({ pid: p.pid, name: `Peer ${p.pid}`, city: 'Pune', state: 'MH' })
      await ctx.db.insert(programmes).values({ institutionPid: p.pid, code: 'CSE', label: 'B.Tech CSE', name: 'B.Tech CSE', intake: 100, lastYearAdmitted: p.pid === '1-9100006' ? 50 : 98 })
      const [u] = await ctx.db.insert(uploads).values({ institutionPid: p.pid, fileName: 'x', uploadedBy: 'nodal@aranya-tech.edu.in', rows: [] }).returning()
      const rows = mk(100, p.late, p.miss)
      await ctx.db.insert(submissions).values({ receiptNo: `T-${p.pid}`, institutionPid: p.pid, uploadId: u.id, ay: '2026-27', submittedBy: 'test', fileName: 'x', records: 100, alerts: 0, hash: '0'.repeat(64), snapshot: { counts: { total: 100, clean: 100, action: 0, auto: 0 }, excess: 0, alerts: [], rows } })
    }
    const found = await anomalies(ctx.db, null)
    const odd = found.get('1-9100006')!
    expect(odd.map((a) => a.key).sort()).toEqual(['exceptions', 'growth', 'late'])
    expect(odd.every((a) => a.method === 'peer' && a.z! >= 3.5)).toBe(true)
    expect(odd.find((a) => a.key === 'late')!.label).toMatch(/^70% of admissions in the last week of the admission window \(peer median \d+%\)$/)
    for (const p of peers.slice(0, 5)) expect(found.has(p.pid)).toBe(false)

    const bureau = await ctx.login('meena.iyer@aicte-india.org')
    const w = (await bureau.get('/api/aicte/insights')).body.watchlist.find((x: { pid: string }) => x.pid === '1-9100006')
    expect(w.factors.filter((f: { kind: string }) => f.kind === 'anomaly')).toHaveLength(3)
    expect(w.risk).toBeGreaterThanOrEqual(36)
  })

  it('uses fixed thresholds when there are too few peers, and says so', async () => {
    await ctx.db.execute(sql`delete from submissions where receipt_no like 'T-1-91000%' and receipt_no <> 'T-1-9100006'`)
    const odd = (await anomalies(ctx.db, null)).get('1-9100006')!
    expect(odd.every((a) => a.method === 'threshold')).toBe(true)
    expect(odd.find((a) => a.key === 'exceptions')!.label).toContain('(threshold 10%)')
  })
})
