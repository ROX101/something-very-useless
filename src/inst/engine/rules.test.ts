import { describe, expect, it } from 'vitest'
import { DATASET, RULE_CONTEXT } from '../data/dataset'
import { applyAllFixes, runRules } from './rules'

describe('rules engine on the Aranya AY 2026-27 file', () => {
  const first = runRules(DATASET.rows, RULE_CONTEXT)

  it('reads 509 rows', () => {
    expect(DATASET.rows).toHaveLength(509)
  })

  it('returns 481 clean · 18 need action · 10 auto-cleared', () => {
    expect(first.counts).toEqual({ total: 509, clean: 481, action: 18, auto: 10 })
  })

  it('breaks down by rule', () => {
    expect(first.byRule).toEqual({
      R01: 2, R02: 4, R03: 3, R04: 1, R08: 1, R09: 1, R06: 3, R07: 2, R10: 1,
      R03a: 6, R04a: 2, R05a: 2,
    })
  })

  it('raises 3 compliance alerts and 12 suggested fixes', () => {
    expect(first.alerts.map((a) => a.rule).sort()).toEqual(['R06', 'R07', 'R10'])
    expect(first.fixable).toBe(12)
  })

  it('builds the seat ledger', () => {
    const l = Object.fromEntries(first.ledger.map((x) => [x.programme.code, x]))
    expect(l.CSE.regular).toBe(180)
    expect(l.AIDS.regular).toBe(123)
    expect(l.AIDS.excess).toBe(3)
    expect(l.ECE.regular).toBe(60)
    expect(l.MECH.regular).toBe(59)
    expect(l.MBA.regular).toBe(60)
    expect(l.CSE.buckets.find((b) => b.key === 'TFW')).toMatchObject({ used: 11, cap: 9 })
  })

  it('after fixes: 507 records, only the 3 compliance alerts remain', () => {
    const fixed = runRules(applyAllFixes(DATASET.rows, first), RULE_CONTEXT)
    expect(fixed.counts.total).toBe(507)
    expect(fixed.dataErrors).toBe(0)
    expect(fixed.alerts).toHaveLength(3)
    expect(fixed.counts.action).toBe(6)
  })
})

describe('sample Excel file', () => {
  it('parses back to the same 481 / 18 / 10', async () => {
    const { readFileSync } = await import('node:fs')
    const { parseWorkbook } = await import('../excel')
    const buf = readFileSync('public/Aranya_AY2026-27_FirstYear.xlsx')
    const parsed = parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    expect(parsed.missing).toEqual([])
    expect(parsed.found).toHaveLength(15)
    expect(runRules(parsed.rows, RULE_CONTEXT).counts).toEqual({ total: 509, clean: 481, action: 18, auto: 10 })
  })
})
