import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { setup } from './test/helpers'
import { parseWorkbook } from '../src/inst/excel'
import { CROSS_ENROLLED, PROBABLE_DUPLICATES } from '../src/inst/data/generateSecond'

let ctx: Awaited<ReturnType<typeof setup>>
beforeAll(async () => { ctx = await setup() })
afterAll(async () => { await ctx.pool.end() })

const file = (name: string) => {
  const buf = readFileSync(`public/${name}`)
  return parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer).rows
}
void XLSX

describe('duplicate ring between the two demo institutions', () => {
  it('flags Meghavarsha\'s shared students once Aranya has submitted, and draws the ring', async () => {
    const aranya = await ctx.login('nodal@aranya-tech.edu.in')
    const up = (await aranya.post('/api/inst/uploads').send({ fileName: 'Aranya_AY2026-27_FirstYear.xlsx', rows: file('Aranya_AY2026-27_FirstYear.xlsx') })).body
    expect(up.result.counts).toEqual({ total: 509, clean: 482, action: 17, auto: 10 })
    const { applyAllFixes, runRules } = await import('../src/inst/engine/rules')
    const { RULE_CONTEXT } = await import('../src/inst/data/dataset')
    const rows = file('Aranya_AY2026-27_FirstYear.xlsx')
    const fixed = applyAllFixes(rows, runRules(rows, { ...RULE_CONTEXT, otherEnrolments: [] }))
    await aranya.put('/api/inst/uploads/current/rows').send({ rows: fixed, fixes: 12 })
    expect((await aranya.post('/api/inst/submissions').send({ declaration: true })).status).toBe(201)

    const megh = await ctx.login('nodal@meghavarsha-tech.edu.in')
    const state = (await megh.get('/api/inst/state')).body
    expect(state.institution).toMatchObject({ pid: '1-9000932', name: 'Meghavarsha Institute of Technology', state: 'MP' })
    expect(state.programmes.map((p: { label: string }) => p.label)).toEqual(['B.Tech CSE', 'B.Tech AI&DS', 'B.Tech ECE', 'B.Tech MECH'])

    const mUp = (await megh.post('/api/inst/uploads').send({ fileName: 'Meghavarsha_AY2026-27_FirstYear.xlsx', rows: file('Meghavarsha_AY2026-27_FirstYear.xlsx') })).body
    expect(mUp.result.dataErrors).toBe(0)
    const alerts = mUp.result.alerts as { rule: string; title: string; rowNos: number[] }[]
    expect(alerts.map((a) => [a.rule, a.rowNos.length])).toEqual([['R10', CROSS_ENROLLED], ['R11', PROBABLE_DUPLICATES]])
    expect(alerts[0].title).toBe(`${CROSS_ENROLLED} students also enrolled at Aranya Institute of Technology, Nashik`)
    expect((await megh.post('/api/inst/submissions').send({ declaration: true })).status).toBe(201)

    const bureau = await ctx.login('meena.iyer@aicte-india.org')
    const ins = (await bureau.get('/api/aicte/insights')).body
    expect(ins.rings).toHaveLength(1)
    expect(ins.rings[0].students).toHaveLength(CROSS_ENROLLED)
    expect(ins.rings[0].probable).toHaveLength(PROBABLE_DUPLICATES)
    const w = ins.watchlist.find((x: { pid: string }) => x.pid === '1-9000932')
    // R10 30 + R11 20 + two statistical anomalies (intake growth, last-week admissions) at fixed thresholds
    expect(w.risk).toBeGreaterThanOrEqual(70)
    const labels = w.factors.map((f: { label: string }) => f.label).join(' | ')
    expect(labels).toContain(`${CROSS_ENROLLED} students also enrolled at Aranya`)
    expect(labels).toContain(`${PROBABLE_DUPLICATES} probable duplicates with Aranya`)
    expect(labels).toMatch(/First-year intake up 6\d% on last year/)
    expect(labels).toMatch(/of admissions in the last week/)
    expect((await bureau.get('/api/aicte/kpis')).body.crossDuplicates).toBe(CROSS_ENROLLED)
    // Western Regional Office (MH, GA) sees the ring because one end of it is in Maharashtra
    const rgn = await ctx.login('rahul.kulkarni@aicte-india.org')
    expect((await rgn.get('/api/aicte/rings')).body).toHaveLength(1)
  })
})
