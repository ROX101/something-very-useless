import { Router } from 'express'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { insights, kpis } from '../services/insights'
import { PROFILES, buildReport, type Profile } from '../services/reports'
import type { Db } from '../db/client'
import { alertActions, apiKeys, auditLog, complianceAlerts, submissions } from '../db/schema'
import { createKey, toPublicKey } from '../lib/apikeys'
import { audit, toTrail, verifyChain } from '../lib/audit'
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
      await audit(tx, req.user!, {
        category: 'Compliance',
        action: body.status === 'Referred to Regional Office' ? 'Referred case to Regional Office' : body.status === 'Reviewed, no action' ? 'Closed case, no action' : 'Reopened case',
        detail: `${alert.id}, ${alert.institution}${body.note ? `: ${body.note}` : ''}`,
        entity: 'alert', entityId: alert.id,
      })
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

  /** NIRF, AISHE and NBA report formats from the enrolment register. Regional officers get their states only. */
  r.get('/reports/:profile', officers, handler(async (req, res) => {
    const profile = req.params.profile as Profile
    if (!PROFILES.includes(profile)) throw notFound('No such report profile')
    const state = typeof req.query.state === 'string' && /^[A-Z]{2}$/.test(req.query.state) ? req.query.state : null
    const report = await buildReport(req.db, profile, '2026-27', stateFilter(req.user!), state)
    await audit(req.db, req.user!, { category: 'Reports', action: 'Generated report', detail: `${report.title}${state ? `, ${state}` : ''}, ${report.rows.length} rows`, entity: 'report', entityId: profile })
    res.json(report)
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

  /** The full trail in the Audit Trail page's format, oldest first, so the browser can re-verify the chain. */
  r.get('/audit/trail', requireRole('aicte_bureau', 'aicte_admin'), handler(async (req, res) => {
    const rows = await req.db.select().from(auditLog).orderBy(asc(auditLog.seq)).limit(20000)
    res.json(rows.map(toTrail))
  }))

  r.get('/audit/verify', requireRole('aicte_bureau', 'aicte_admin'), handler(async (req, res) => {
    res.json(await verifyChain(req.db))
  }))

  // Keys for AICTE systems (e.g. the approval portal pushing approved intake). IT cell only.
  r.get('/api-keys', requireRole('aicte_admin'), handler(async (req, res) => {
    const rows = await req.db.select().from(apiKeys).where(eq(apiKeys.scope, 'aicte')).orderBy(desc(apiKeys.createdAt))
    res.json(rows.map(toPublicKey))
  }))

  r.post('/api-keys', requireRole('aicte_admin'), handler(async (req, res) => {
    const { name } = parse(z.object({ name: z.string().trim().min(2).max(60) }), req.body)
    const k = await createKey(req.db, { scope: 'aicte', name, createdBy: req.user!.userId })
    await audit(req.db, req.user!, { category: 'Administration', action: 'Created API key', detail: `${name} (${k.id}), AICTE systems`, entity: 'api_key', entityId: k.id })
    res.status(201).json({ id: k.id, name, key: k.key })
  }))

  r.delete('/api-keys/:id', requireRole('aicte_admin'), handler(async (req, res) => {
    const [k] = await req.db.update(apiKeys).set({ revokedAt: new Date().toISOString() }).where(and(eq(apiKeys.id, req.params.id), eq(apiKeys.scope, 'aicte'))).returning()
    if (!k) throw notFound('No such key')
    await audit(req.db, req.user!, { category: 'Administration', action: 'Revoked API key', detail: `${k.name} (${k.id})`, entity: 'api_key', entityId: k.id })
    res.status(204).end()
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
