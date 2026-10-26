import { inArray } from 'drizzle-orm'
import { institutions } from '../db/schema'
import { nameSimilarity } from '../../src/inst/engine/similarity'
import { PROBABLE_NAME_SIMILARITY } from '../../src/inst/engine/rules'
import { anomalies } from './anomalies'
import { sql } from 'drizzle-orm'
import type { Db } from '../db/client'

/** Points each open alert adds to an institution's risk score (capped at 100). */
export const RISK_POINTS: Record<string, number> = { R10: 30, R06: 25, R11: 20, R07: 15, R05: 10 }
const CLOSED = 'Reviewed, no action'

const inStates = (column: string, states: string[] | null) =>
  states ? sql`and ${sql.raw(column)} in ${states.length ? states : ['__']}` : sql``

/** Latest submission per institution, the base for every national figure. */
const latest = sql`(select distinct on (institution_pid) * from submissions order by institution_pid, submitted_at desc)`

/** Alerts whose most recent case action is not a closure. */
const openAlerts = (states: string[] | null) => sql`
  select a.* from compliance_alerts a
  left join lateral (select status from alert_actions where alert_id = a.id order by at desc, id desc limit 1) x on true
  where coalesce(x.status, 'Open') <> ${CLOSED} ${inStates('a.state', states)}`

export async function kpis(db: Db, states: string[] | null) {
  const [inst, subs, rows, open, dup] = await Promise.all([
    db.execute<{ n: number }>(sql`select count(*)::int as n from institutions where true ${inStates('state', states)}`),
    db.execute<{ n: number; records: number }>(sql`
      select count(*)::int as n, coalesce(sum(s.records), 0)::int as records
      from ${latest} s join institutions i on i.pid = s.institution_pid where true ${inStates('i.state', states)}`),
    db.execute<{ total: number; linked: number }>(sql`
      select count(*)::int as total,
             count(*) filter (where replace(r->>'APAAR_ID', ' ', '') ~ '^[0-9]{12}$')::int as linked
      from ${latest} s join institutions i on i.pid = s.institution_pid, jsonb_array_elements(s.snapshot->'rows') r
      where true ${inStates('i.state', states)}`),
    db.execute<{ n: number }>(sql`select count(*)::int as n from (${openAlerts(states)}) o`),
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from (select apaar from enrolments where apaar is not null and status = 'active' group by apaar, ay having count(distinct institution_pid) > 1) d`),
  ])
  const total = rows.rows[0].total
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0)
  return {
    institutions: inst.rows[0].n,
    submitted: subs.rows[0].n,
    records: subs.rows[0].records,
    apaarLinkedPct: pct(rows.rows[0].linked),
    exceptionPct: pct(total - rows.rows[0].linked),
    openAlerts: open.rows[0].n,
    crossDuplicates: dup.rows[0].n,
  }
}

export interface StateStat { code: string; institutions: number; submitted: number; excessAlerts: number; openAlerts: number; apaarPct: number }
export interface WatchItem {
  pid: string; institution: string; city: string; state: string; risk: number; reason: string
  factors: { label: string; points: number; clause: string; alertId: string; kind: 'alert' | 'anomaly' }[]
}
export interface Ring {
  from: { pid: string; name: string; city: string; state: string }
  to: { pid: string; name: string; city: string; state: string }
  students: { apaar: string; name: string | null }[]
  /** Probable duplicates: same DOB and very similar name, different or missing APAAR ID. */
  probable: { a: { name: string; apaar: string | null; instStudentId: string | null }; b: { name: string; apaar: string | null; instStudentId: string | null }; similarity: number }[]
}

export async function insights(db: Db, states: string[] | null) {
  const [stateRows, open, ringRows] = await Promise.all([
    db.execute<{ code: string; institutions: number; submitted: number; linked: number; total: number }>(sql`
      select i.state as code, count(distinct i.pid)::int as institutions, count(distinct s.institution_pid)::int as submitted,
             coalesce(sum(r.linked), 0)::int as linked, coalesce(sum(r.total), 0)::int as total
      from institutions i
      left join ${latest} s on s.institution_pid = i.pid
      left join lateral (
        select count(*) as total, count(*) filter (where replace(e->>'APAAR_ID', ' ', '') ~ '^[0-9]{12}$') as linked
        from jsonb_array_elements(s.snapshot->'rows') e
      ) r on s.receipt_no is not null
      where true ${inStates('i.state', states)}
      group by i.state`),
    db.execute<{ id: string; institution_pid: string; institution: string; city: string; state: string; rule: string; title: string; clause: string }>(
      sql`${openAlerts(states)} order by detected_at desc`),
    db.execute<{ a_pid: string; a_name: string; a_city: string; a_state: string; b_pid: string; b_name: string; b_city: string; b_state: string; apaar: string; name: string | null }>(sql`
      select a.institution_pid as a_pid, a.institution as a_name, a.city as a_city, coalesce(ia.state, '') as a_state,
             b.institution_pid as b_pid, b.institution as b_name, b.city as b_city, coalesce(ib.state, '') as b_state,
             a.apaar, reg.name
      from enrolments a
      join enrolments b on a.apaar = b.apaar and a.ay = b.ay and a.institution_pid < b.institution_pid and a.status = 'active' and b.status = 'active'
      left join institutions ia on ia.pid = a.institution_pid
      left join institutions ib on ib.pid = b.institution_pid
      left join apaar_registry reg on reg.apaar = a.apaar
      order by a.institution_pid, b.institution_pid, a.apaar`),
  ])

  const openByState = new Map<string, { open: number; excess: number }>()
  for (const a of open.rows) {
    const s = openByState.get(a.state) ?? { open: 0, excess: 0 }
    s.open++
    if (a.rule === 'R06') s.excess++
    openByState.set(a.state, s)
  }
  const stateStats: StateStat[] = stateRows.rows.map((s) => ({
    code: s.code, institutions: s.institutions, submitted: s.submitted,
    excessAlerts: openByState.get(s.code)?.excess ?? 0, openAlerts: openByState.get(s.code)?.open ?? 0,
    apaarPct: s.total ? Math.round((s.linked / s.total) * 1000) / 10 : 0,
  }))

  const byInst = new Map<string, WatchItem>()
  for (const a of open.rows) {
    const w = byInst.get(a.institution_pid) ?? { pid: a.institution_pid, institution: a.institution, city: a.city, state: a.state, risk: 0, reason: '', factors: [] }
    w.factors.push({ label: a.title, points: RISK_POINTS[a.rule] ?? 5, clause: a.clause, alertId: a.id, kind: 'alert' })
    byInst.set(a.institution_pid, w)
  }
  // Statistical anomalies add to the risk score with their reason, even for institutions without open alerts.
  const found = await anomalies(db, states)
  if (found.size) {
    const info = await db.select().from(institutions).where(inArray(institutions.pid, [...found.keys()]))
    for (const i of info) {
      const w = byInst.get(i.pid) ?? { pid: i.pid, institution: i.name, city: i.city, state: i.state, risk: 0, reason: '', factors: [] }
      for (const an of found.get(i.pid)!) w.factors.push({ label: an.label, points: an.points, clause: '', alertId: `anomaly:${an.key}`, kind: 'anomaly' })
      byInst.set(i.pid, w)
    }
  }
  const watchlist = [...byInst.values()].map((w) => {
    w.factors.sort((x, y) => y.points - x.points)
    w.risk = Math.min(100, w.factors.reduce((n, f) => n + f.points, 0))
    w.reason = w.factors[0].label
    return w
  }).sort((x, y) => y.risk - x.risk)

  const rings = new Map<string, Ring>()
  for (const r of ringRows.rows) {
    if (states && !states.includes(r.a_state) && !states.includes(r.b_state)) continue
    const key = `${r.a_pid}|${r.b_pid}`
    const ring = rings.get(key) ?? {
      from: { pid: r.a_pid, name: r.a_name, city: r.a_city, state: r.a_state },
      to: { pid: r.b_pid, name: r.b_name, city: r.b_city, state: r.b_state },
      students: [], probable: [],
    }
    ring.students.push({ apaar: r.apaar, name: r.name })
    rings.set(key, ring)
  }

  // Probable duplicates across institutions: same DOB, name similarity >= PROBABLE_NAME_SIMILARITY, APAAR IDs differ or are missing.
  const sameDob = await db.execute<{ pid: string; institution: string; city: string; state: string; name: string; dob: string; gender: string | null; apaar: string | null; inst_student_id: string | null }>(sql`
    select e.institution_pid as pid, e.institution, e.city, coalesce(i.state, '') as state, e.name, e.dob::text as dob, e.gender, e.apaar, e.inst_student_id
    from enrolments e left join institutions i on i.pid = e.institution_pid
    where e.status = 'active' and e.dob is not null and e.name is not null and e.dob in (
      select dob from enrolments where status = 'active' and dob is not null group by dob, ay having count(distinct institution_pid) > 1)
    order by e.dob, e.institution_pid`)
  const groups = new Map<string, typeof sameDob.rows>()
  for (const r of sameDob.rows) groups.set(r.dob, [...(groups.get(r.dob) ?? []), r])
  for (const g of groups.values()) {
    for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) {
      const [a, b] = g[x].pid < g[y].pid ? [g[x], g[y]] : [g[y], g[x]]
      if (a.pid === b.pid || (a.apaar && a.apaar === b.apaar) || (a.gender && b.gender && a.gender !== b.gender)) continue
      const sim = nameSimilarity(a.name, b.name)
      if (sim < PROBABLE_NAME_SIMILARITY) continue
      if (states && !states.includes(a.state) && !states.includes(b.state)) continue
      const key = `${a.pid}|${b.pid}`
      const ring = rings.get(key) ?? { from: { pid: a.pid, name: a.institution, city: a.city, state: a.state }, to: { pid: b.pid, name: b.institution, city: b.city, state: b.state }, students: [], probable: [] }
      ring.probable.push({ a: { name: a.name, apaar: a.apaar, instStudentId: a.inst_student_id }, b: { name: b.name, apaar: b.apaar, instStudentId: b.inst_student_id }, similarity: Math.round(sim * 100) / 100 })
      rings.set(key, ring)
    }
  }

  return { states: stateStats, watchlist, rings: [...rings.values()].sort((x, y) => (y.students.length + y.probable.length) - (x.students.length + x.probable.length)) }
}
