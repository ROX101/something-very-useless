import { sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { SubmissionSnapshot } from '../db/schema'

/**
 * Statistical anomaly detection across institutions, on top of the rule checks.
 *
 * Each institution's latest submission gives a few rates. An institution is flagged when its rate is far from
 * its peers: modified z-score (Iglewicz & Hoaglin) = 0.6745 (x − median) / MAD, flagged at 3.5 or more.
 * With fewer than MIN_PEERS institutions reporting a metric, a fixed threshold is used instead, and the finding
 * says which method applied. Every finding is explainable: value, baseline and method.
 */
export const MIN_PEERS = 5
export const Z_FLAG = 3.5

export interface Anomaly {
  key: 'growth' | 'late' | 'exceptions' | 'supernumerary' | 'revisions'
  label: string
  value: number
  baseline: number
  method: 'peer' | 'threshold'
  z: number | null
  points: number
}

interface Metric {
  key: Anomaly['key']
  /** Fallback when there are too few peers. */
  threshold: number
  describe: (v: number, base: number, method: Anomaly['method']) => string
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const vs = (base: number, method: Anomaly['method'], f: (n: number) => string) => (method === 'peer' ? `peer median ${f(base)}` : `threshold ${f(base)}`)

const METRICS: Metric[] = [
  { key: 'growth', threshold: 0.5, describe: (v, b, m) => `First-year intake ${v >= 0 ? 'up' : 'down'} ${pct(Math.abs(v))} on last year (${vs(b, m, (n) => `${n >= 0 ? '+' : ''}${pct(n)}`)})` },
  { key: 'late', threshold: 0.35, describe: (v, b, m) => `${pct(v)} of admissions in the last week of the admission window (${vs(b, m, pct)})` },
  { key: 'exceptions', threshold: 0.1, describe: (v, b, m) => `${pct(v)} of students without an APAAR ID (${vs(b, m, pct)})` },
  { key: 'supernumerary', threshold: 0.25, describe: (v, b, m) => `Supernumerary admissions equal ${pct(v)} of approved intake (${vs(b, m, pct)})` },
  { key: 'revisions', threshold: 3, describe: (v, b, m) => `${v} revised submissions this year (${vs(b, m, (n) => String(Math.round(n)))})` },
]

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Modified z-score. When more than half the peers share the same value the MAD is zero; then, as IBM SPSS and
 * Iglewicz & Hoaglin suggest, scale by the mean absolute deviation instead (z = (x − median) / (1.253314 · meanAD)).
 */
export function modifiedZ(x: number, values: number[]) {
  const med = median(values)
  const dev = values.map((v) => Math.abs(v - med))
  const mad = median(dev)
  if (mad > 0) return { med, z: (0.6745 * (x - med)) / mad }
  const meanAd = dev.reduce((a, b) => a + b, 0) / dev.length
  if (meanAd > 0) return { med, z: (x - med) / (1.253314 * meanAd) }
  return { med, z: x === med ? 0 : Number.POSITIVE_INFINITY * Math.sign(x - med) }
}

interface Row { pid: string; state: string; snapshot: SubmissionSnapshot; revisions: number; intake: number; lastYear: number | null }

const SUPERNUMERARY = new Set(['FN-OCI-CIWG', 'TFW', 'PM-USPY'])
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

/** Computes the metric values for every institution with a submission, then flags outliers. */
export async function anomalies(db: Db, states: string[] | null): Promise<Map<string, Anomaly[]>> {
  const res = await db.execute<{ pid: string; state: string; snapshot: SubmissionSnapshot; revisions: number; intake: number; last_year: number | null }>(sql`
    select s.institution_pid as pid, i.state, s.snapshot, c.n - 1 as revisions,
           coalesce((select sum(intake) from programmes p where p.institution_pid = s.institution_pid), 0)::int as intake,
           (select sum(last_year_admitted) from programmes p where p.institution_pid = s.institution_pid)::int as last_year
    from (select distinct on (institution_pid) * from submissions order by institution_pid, submitted_at desc) s
    join institutions i on i.pid = s.institution_pid
    join (select institution_pid, count(*)::int as n from submissions group by institution_pid) c on c.institution_pid = s.institution_pid`)
  const rows: Row[] = res.rows.map((r) => ({ pid: r.pid, state: r.state, snapshot: r.snapshot, revisions: Number(r.revisions), intake: Number(r.intake), lastYear: r.last_year == null ? null : Number(r.last_year) }))

  // National admission window end: the latest admission date anyone reported.
  let windowEnd = 0
  for (const r of rows) for (const x of r.snapshot.rows) if (x.ADMISSION_DATE) windowEnd = Math.max(windowEnd, day(x.ADMISSION_DATE))

  const values = new Map<Anomaly['key'], Map<string, number>>(METRICS.map((m) => [m.key, new Map()]))
  for (const r of rows) {
    const list = r.snapshot.rows
    if (!list.length) continue
    const firstYear = list.length
    if (r.lastYear && r.lastYear > 0) values.get('growth')!.set(r.pid, firstYear / r.lastYear - 1)
    const dated = list.filter((x) => x.ADMISSION_DATE)
    if (dated.length && windowEnd) values.get('late')!.set(r.pid, dated.filter((x) => windowEnd - day(x.ADMISSION_DATE!) < 7 * 86400000).length / dated.length)
    if (list.some((x) => x.APAAR_EXCEPTION !== undefined)) values.get('exceptions')!.set(r.pid, list.filter((x) => !x.APAAR_ID.trim()).length / list.length)
    if (r.intake > 0 && list.some((x) => x.QUOTA)) values.get('supernumerary')!.set(r.pid, list.filter((x) => SUPERNUMERARY.has(x.QUOTA ?? '')).length / r.intake)
    values.get('revisions')!.set(r.pid, r.revisions)
  }

  const out = new Map<string, Anomaly[]>()
  for (const m of METRICS) {
    const byPid = values.get(m.key)!
    const all = [...byPid.values()]
    const peer = all.length >= MIN_PEERS
    for (const [pid, v] of byPid) {
      let flagged = false
      let z: number | null = null
      let base = m.threshold
      if (peer) {
        const r = modifiedZ(v, all)
        z = Number.isFinite(r.z) ? Math.round(r.z * 10) / 10 : null
        base = r.med
        flagged = Number.isFinite(r.z) ? r.z >= Z_FLAG : r.z > 0
      } else {
        flagged = v > m.threshold
      }
      if (!flagged) continue
      const a: Anomaly = { key: m.key, label: m.describe(v, base, peer ? 'peer' : 'threshold'), value: Math.round(v * 1000) / 1000, baseline: Math.round(base * 1000) / 1000, method: peer ? 'peer' : 'threshold', z, points: z !== null && z >= 5 ? 18 : 12 }
      out.set(pid, [...(out.get(pid) ?? []), a])
    }
  }

  if (states) for (const r of rows) if (!states.includes(r.state)) out.delete(r.pid)
  return out
}
