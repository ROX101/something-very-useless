import { Router } from 'express'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { insights, kpis } from '../services/insights'
import type { Db } from '../db/client'
import { alertActions, auditLog, complianceAlerts, submissions } from '../db/schema'
import { audit, verifyChain } from '../lib/audit'
import { requireRole, type SessionUser } from '../lib/auth'
import { forbidden, handler, notFound, parse } from '../lib/http'

const CASE_STATUSES = ['Open', 'Referred to Regional Office', 'Reviewed, no action'] as const
const Action = z.object({ status: z.enum(CASE_STATUSES), note: z.string().max(2000).default('') })

/** Regional officers see only their states; bureau sees all India. */
const stateFilter = (u: SessionUser) => (u.role === 'aicte_regional' ? u.states : null)

async function listAlerts(db: Db, states: string[] | null) {
  const rows = await db
    .select({ a: complianceAlerts, hash: submissions.hash })
    .from(complianceAlerts)
    .leftJoin(submissions, eq(complianceAlerts.receiptNo, submissions.receiptNo))
    .where(states ? inArray(complianceAlerts.state, states.length ? states : ['__']) : undefined)
    .orderBy(desc(complianceAlerts.live), desc(complianceAlerts.detectedAt))
  return rows.map(({ a, hash }) => ({
    id: a.id, institution: a.institution, pid: a.institutionPid, city: a.city, state: a.state, rule: a.rule,
    title: a.title, detail: a.detail, clause: a.clause, detected: a.detectedAt,
    ...(a.live ? { live: true, receiptNo: a.receiptNo ?? undefined, hash: hash ?? undefined, rows: a.rows } : {}),
    ...(a.risk != null ? { risk: a.risk } : {}),
  }))
}

async function latestCases(db: Db) {
  const rows = await db.execute<{ alert_id: string; status: string; note: string; by: string; at: string }>(sql`
    select distinct on (alert_id) alert_id, status, note, "by", at
    from alert_actions order by alert_id, at desc, id desc`)
  return Object.fromEntries(rows.rows.map((r) => [r.alert_id, { status: r.status, note: r.note, by: r.by, at: new Date(r.at).toISOString() }]))
}

async function latestLive(db: Db, states: string[] | null) {
  const [s] = await db.select().from(submissions)
    .where(states ? sql`${submissions.institutionPid} in (select pid from institutions where state in ${states.length ? states : ["__"]}))` : undefined)
    .orderBy(desc(submissions.submittedAt)).limit(1)
  if (!s) return null
  const alerts = (await listAlerts(db, states)).filter((a) => a.receiptNo === s.receiptNo)
  return {
    submission: { receiptNo: s.receiptNo, submittedAt: s.submittedAt, submittedBy: s.submittedBy, records: s.records, alerts: s.alerts, hash: s.hash, fileName: s.fileName, status: s.status },
    alerts,
    excess: s.snapshot.excess,
  }
}

export function aicteRoutes() {
  const r = Router()
  const officers = requireRole('aicte_bureau', 'aicte_regional')

  r.get('/alerts', officers, handler(async (req, res) => {
    res.json(await listAlerts(req.db, stateFilter(req.user!)))
  }))

  r.get('/cases', officers, handler(async (req, res) => {
    res.json(await latestCases(req.db))
  }))

  r.get('/alerts/:id/actions', officers, handler(async (req, res) => {
    const rows = await req.db.select().from(alertActions).where(eq(alertActions.alertId, req.params.id)).orderBy(desc(alertActions.at))
    res.json(rows)
  }))

  r.post('/alerts/:id/actions', officers, handler(async (req, res) => {
    const body = parse(Action, req.body)
    const alert = await req.db.query.complianceAlerts.findFirst({ where: eq(complianceAlerts.id, req.params.id) })
    if (!alert) throw notFound('No such alert')
    const states = stateFilter(req.user!)
    if (states && !states.includes(alert.state)) throw forbidden('This alert is outside your region')
    const at = new Date().toISOString()
    await req.db.transaction(async (tx) => {
      await tx.insert(alertActions).values({ alertId: alert.id, status: body.status, note: body.note, by: req.user!.name, at })
      await audit(tx, req.user!, { action: 'alert.action', entity: 'alert', entityId: alert.id, payload: { status: body.status, note: body.note } })
    })
    res.status(201).json({ status: body.status, note: body.note, by: req.user!.name, at })
  }))

  r.get('/live', officers, handler(async (req, res) => {
    res.json(await latestLive(req.db, stateFilter(req.user!)))
  }))

  r.get('/kpis', officers, handler(async (req, res) => {
    res.json(await kpis(req.db, stateFilter(req.user!)))
  }))

  /** Per-state figures, risk watch-list and cross-institution rings, all computed from live data. */
  r.get('/insights', officers, handler(async (req, res) => {
    res.json(await insights(req.db, stateFilter(req.user!)))
  }))

  /** Cross-institution duplicates: same APAAR ID actively enrolled at two or more institutions in the same AY. */
  r.get('/rings', officers, handler(async (req, res) => {
    res.json((await insights(req.db, stateFilter(req.user!))).rings)
  }))

  r.get('/audit', requireRole('aicte_bureau', 'aicte_admin'), handler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500)
    const entity = typeof req.query.entity === 'string' ? req.query.entity : undefined
    const rows = await req.db.select().from(auditLog).where(entity ? eq(auditLog.entity, entity) : undefined).orderBy(desc(auditLog.seq)).limit(limit)
    res.json(rows)
  }))

  r.get('/audit/verify', requireRole('aicte_bureau', 'aicte_admin'), handler(async (req, res) => {
    res.json(await verifyChain(req.db))
  }))

  r.get('/submissions', officers, handler(async (req, res) => {
    const states = stateFilter(req.user!)
    const rows = await req.db.select().from(submissions)
      .where(states ? and(sql`${submissions.institutionPid} in (select pid from institutions where state in ${states.length ? states : ["__"]}))`) : undefined)
      .orderBy(desc(submissions.submittedAt)).limit(200)
    res.json(rows.map(({ snapshot: _s, ...s }) => s))
  }))

  return r
}
