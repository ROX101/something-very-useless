import { PROGRAMMES, PM_USPY_INSTITUTION_MAX, caps } from '../data/reference'
import { basicName, nameSimilarity, normaliseName } from './similarity'
import {
  EXCEPTION_CODES,
  type Bucket,
  type ComplianceAlert,
  type Flag,
  type LedgerLine,
  type OtherEnrolment,
  type Programme,
  type RegistryEntry,
  type RowResult,
  type RuleCode,
  type UploadRow,
  type ValidationResult,
} from './types'

export interface RuleContext {
  institutionPid: string
  programmes: Programme[]
  registry: RegistryEntry[]
  otherEnrolments: OtherEnrolment[]
}

export const RULE_INFO: Record<RuleCode, { title: string; clause?: string; gate: number }> = {
  R01: { title: 'Duplicate row', gate: 2 },
  R02: { title: 'Invalid APAAR ID format', gate: 0 },
  R03: { title: 'APAAR ID missing, no reason given', gate: 0 },
  R03a: { title: 'No APAAR ID, valid exception code', gate: 0 },
  R04: { title: 'Mismatch with APAAR registry', gate: 1 },
  R04a: { title: 'Name variant matched', gate: 1 },
  R05: { title: 'NRI seats above 5% of intake', clause: '2.8(b)', gate: 3 },
  R05a: { title: 'Converted NRI seat', clause: '2.8(d)', gate: 3 },
  R06: { title: 'Admissions exceed approved intake', clause: '7.4(g)', gate: 3 },
  R07: { title: 'Supernumerary cap exceeded', gate: 3 },
  R08: { title: 'Foreign National status vs nationality', gate: 4 },
  R09: { title: 'OCI status without OCI card number', gate: 4 },
  R10: { title: 'Enrolled at another institution', gate: 5 },
}

export const GATES = ['Format', 'APAAR', 'Duplicates', 'Quota', 'Consistency', 'Cross-institution'] as const

const APAAR_OK = /^(\d{12}|\d{4} \d{4} \d{4})$/
const EXCEPTION_TEXT: Record<string, string> = {
  CONSENT_REFUSED: 'Student declined APAAR consent',
  FOREIGN_NATIONAL: 'Foreign national, not eligible for APAAR',
  GENERATION_PENDING: 'APAAR generation pending',
}

const byLatest = (a: UploadRow, b: UploadRow) =>
  b.ADMISSION_DATE.localeCompare(a.ADMISSION_DATE) || b.rowNo - a.rowNo

function findProgramme(programmes: Programme[], value: string) {
  const v = value.trim().toLowerCase()
  return programmes.find((p) => p.label.toLowerCase() === v || p.code.toLowerCase() === v || p.name.toLowerCase() === v)
}

export function runRules(rows: UploadRow[], ctx: RuleContext): ValidationResult {
  const registry = new Map(ctx.registry.map((e) => [e.apaar, e]))
  const byNameDob = new Map(ctx.registry.map((e) => [`${normaliseName(e.name)}|${e.dob}`, e]))
  const elsewhere = new Map(ctx.otherEnrolments.map((e) => [e.apaar, e]))

  const flags = new Map<number, Flag[]>()
  const add = (r: UploadRow, f: Flag) => {
    const list = flags.get(r.rowNo) ?? []
    list.push(f)
    flags.set(r.rowNo, list)
  }
  const alerts: ComplianceAlert[] = []

  const seen = new Set<string>()
  const live: UploadRow[] = []

  for (const r of rows) {
    const key = [r.APAAR_ID, r.INST_STUDENT_ID, basicName(r.NAME), r.DOB].join('|')
    if (seen.has(key)) {
      add(r, { rule: 'R01', kind: 'error', message: 'Same student appears earlier in the file', fix: { label: 'Remove duplicate row', remove: true } })
      continue
    }
    seen.add(key)
    live.push(r)

    const raw = r.APAAR_ID.trim()
    const exception = r.APAAR_EXCEPTION.trim().toUpperCase()
    const lookup = byNameDob.get(`${normaliseName(r.NAME)}|${r.DOB}`)

    if (!raw) {
      if ((EXCEPTION_CODES as readonly string[]).includes(exception)) {
        add(r, { rule: 'R03a', kind: 'auto', field: 'APAAR_EXCEPTION', message: EXCEPTION_TEXT[exception] })
      } else {
        add(r, {
          rule: 'R03', kind: 'error', field: 'APAAR_ID', message: 'APAAR ID is blank and no exception code is given',
          fix: lookup ? { label: `Use APAAR ${lookup.apaar} (registry match on name + DOB)`, changes: { APAAR_ID: lookup.apaar } } : undefined,
        })
      }
    } else if (!APAAR_OK.test(raw)) {
      add(r, {
        rule: 'R02', kind: 'error', field: 'APAAR_ID', message: `"${raw}" is not a 12-digit APAAR ID`,
        fix: lookup ? { label: `Use APAAR ${lookup.apaar} (registry match on name + DOB)`, changes: { APAAR_ID: lookup.apaar } } : undefined,
      })
    } else {
      const apaar = raw.replace(/\s/g, '')
      const reg = registry.get(apaar)
      if (!reg) {
        add(r, { rule: 'R04', kind: 'error', field: 'APAAR_ID', message: 'APAAR ID not found in the registry' })
      } else {
        const sim = nameSimilarity(r.NAME, reg.name)
        if (reg.dob !== r.DOB) {
          add(r, {
            rule: 'R04', kind: 'error', field: 'DOB', message: `DOB ${r.DOB} differs from registry DOB ${reg.dob}`,
            fix: sim >= 0.9 ? { label: `Set DOB to ${reg.dob} (registry)`, changes: { DOB: reg.dob } } : undefined,
          })
        } else if (sim < 0.9) {
          add(r, { rule: 'R04', kind: 'error', field: 'NAME', message: `Name differs from registry name "${reg.name}"` })
        } else if (basicName(r.NAME) !== basicName(reg.name)) {
          add(r, { rule: 'R04a', kind: 'auto', field: 'NAME', message: `${r.NAME} ≈ ${reg.name}, similarity ${sim.toFixed(2)}` })
        }
      }
      const other = elsewhere.get(apaar)
      if (other && other.pid !== ctx.institutionPid) {
        const id = `R10-${apaar}`
        add(r, { rule: 'R10', kind: 'alert', field: 'APAAR_ID', alertId: id, message: `Active enrolment at ${other.institution}, ${other.city}, AY ${other.ay}` })
        alerts.push({
          id, rule: 'R10', clause: '',
          title: `1 student also enrolled at ${other.institution}, ${other.city}`,
          detail: `Same APAAR ID, AY ${other.ay}`,
          rowNos: [r.rowNo],
        })
      }
    }

    if (r.QUOTA === 'NRI-CONVERTED' && r.NRI === 'N') {
      add(r, { rule: 'R05a', kind: 'auto', field: 'QUOTA', message: 'Vacant NRI seat filled by a general merit candidate, counts within intake' })
    }
    if (r.FN === 'Y' && r.NATIONALITY.trim().toLowerCase() === 'indian') {
      add(r, { rule: 'R08', kind: 'error', field: 'FN', message: 'Marked Foreign National but nationality is Indian', fix: { label: 'Set FN to N', changes: { FN: 'N' } } })
    }
    if (r.OCI === 'Y' && !r.OCI_CARD_NO.trim()) {
      const indian = r.NATIONALITY.trim().toLowerCase() === 'indian'
      add(r, {
        rule: 'R09', kind: 'error', field: 'OCI_CARD_NO', message: 'OCI status is Y but the OCI card number is blank',
        fix: indian ? { label: 'Set OCI to N (nationality is Indian)', changes: { OCI: 'N' } } : undefined,
      })
    }
  }

  const ledger: LedgerLine[] = []
  let pmUspyTotal = 0
  for (const p of ctx.programmes) {
    const pr = live.filter((r) => findProgramme(ctx.programmes, r.PROGRAMME)?.code === p.code)
    const c = caps(p.intake)
    const q = (name: string) => pr.filter((r) => r.QUOTA === name)
    const regularRows = pr.filter((r) => ['REGULAR', 'NRI', 'NRI-CONVERTED'].includes(r.QUOTA))
    const excess = Math.max(0, regularRows.length - p.intake)

    if (excess > 0) {
      const id = `R06-${p.code}`
      const hit = [...regularRows].sort(byLatest).slice(0, excess)
      hit.forEach((r) => add(r, { rule: 'R06', kind: 'alert', alertId: id, field: 'ADMISSION_DATE', message: `Admitted after ${p.label} reached its approved intake of ${p.intake}` }))
      alerts.push({
        id, rule: 'R06', clause: '7.4(g)',
        title: `${p.label}: ${regularRows.length} admitted against approved intake of ${p.intake}`,
        detail: `${excess} excess admission${excess > 1 ? 's' : ''}`,
        rowNos: hit.map((r) => r.rowNo),
      })
    }

    const nri = q('NRI')
    if (nri.length > c.nri) {
      const id = `R05-${p.code}`
      const hit = [...nri].sort(byLatest).slice(0, nri.length - c.nri)
      hit.forEach((r) => add(r, { rule: 'R05', kind: 'alert', alertId: id, field: 'QUOTA', message: `NRI seats above ${c.nri} (5% of intake)` }))
      alerts.push({ id, rule: 'R05', clause: '2.8(b)', title: `${p.label}: ${nri.length} NRI seats against a limit of ${c.nri}`, detail: 'NRI seats are within the approved intake', rowNos: hit.map((r) => r.rowNo) })
    }

    const regularFill = regularRows.length / p.intake
    const bucketDefs: { key: Bucket['key']; label: string; cap: number; clause: string }[] = [
      { key: 'FN-OCI-CIWG', label: 'FN/OCI/CIWG', cap: c.fnOciCiwg, clause: '2.9' },
      { key: 'TFW', label: 'TFW', cap: regularFill >= 0.5 ? c.tfw : 0, clause: '6.42(d)(i)' },
      { key: 'PM-USPY', label: 'PM-USPY', cap: c.pmUspy, clause: '6.43(b)' },
    ]
    const buckets: Bucket[] = []
    for (const b of bucketDefs) {
      const used = q(b.key)
      if (b.key === 'PM-USPY') pmUspyTotal += used.length
      if (used.length > b.cap) {
        const id = `R07-${p.code}-${b.key}`
        const hit = [...used].sort(byLatest).slice(0, used.length - b.cap)
        hit.forEach((r) => add(r, { rule: 'R07', kind: 'alert', alertId: id, field: 'QUOTA', message: `${b.label} seats above the cap of ${b.cap}` }))
        alerts.push({
          id, rule: 'R07', clause: b.clause,
          title: `${p.label}: ${b.label} ${used.length} against a cap of ${b.cap}`,
          detail: `${used.length - b.cap} seat${used.length - b.cap > 1 ? 's' : ''} over the supernumerary cap`,
          rowNos: hit.map((r) => r.rowNo),
        })
      }
      if (used.length > 0 || b.key !== 'PM-USPY') buckets.push({ key: b.key, label: b.label, used: used.length, cap: b.cap })
    }

    ledger.push({ programme: p, regular: regularRows.length, nri: nri.length, nriConverted: q('NRI-CONVERTED').length, excess, buckets })
  }

  if (pmUspyTotal > PM_USPY_INSTITUTION_MAX) {
    alerts.push({ id: 'R07-PMUSPY-INST', rule: 'R07', clause: '6.43(b)', title: `PM-USPY: ${pmUspyTotal} seats against an institution limit of ${PM_USPY_INSTITUTION_MAX}`, detail: 'Institution-wide cap', rowNos: [] })
  }

  alerts.sort((a, b) => a.rule.localeCompare(b.rule) || a.id.localeCompare(b.id))

  const results: RowResult[] = rows.map((row) => {
    const f = flags.get(row.rowNo) ?? []
    const status = f.some((x) => x.kind !== 'auto') ? 'action' : f.length ? 'auto' : 'clean'
    return { row, flags: f, status }
  })

  const byRule: Partial<Record<RuleCode, number>> = {}
  for (const r of results) for (const f of r.flags) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1

  const counts = {
    total: results.length,
    clean: results.filter((r) => r.status === 'clean').length,
    action: results.filter((r) => r.status === 'action').length,
    auto: results.filter((r) => r.status === 'auto').length,
  }
  const dataErrors = results.filter((r) => r.flags.some((f) => f.kind === 'error')).length
  const fixable = results.reduce((n, r) => n + r.flags.filter((f) => f.kind === 'error' && f.fix).length, 0)

  return { rows: results, counts, byRule, alerts, dataErrors, fixable, ledger }
}

export function applyFix(rows: UploadRow[], rowNo: number, fix: { remove?: boolean; changes?: Partial<UploadRow> }): UploadRow[] {
  if (fix.remove) {
    const idx = rows.findIndex((r) => r.rowNo === rowNo)
    return idx === -1 ? rows : [...rows.slice(0, idx), ...rows.slice(idx + 1)]
  }
  return rows.map((r) => (r.rowNo === rowNo ? { ...r, ...fix.changes } : r))
}

export function applyAllFixes(rows: UploadRow[], result: ValidationResult): UploadRow[] {
  let out = rows
  for (const rr of result.rows) {
    for (const f of rr.flags) if (f.kind === 'error' && f.fix) out = applyFix(out, rr.row.rowNo, f.fix)
  }
  return out
}

export const defaultProgrammes = PROGRAMMES
