import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import type { Role } from '../../src/auth/directory'
import { audit, type Category } from '../lib/audit'
import { requireAuth } from '../lib/auth'
import { forbidden, handler, parse } from '../lib/http'

/**
 * Events the browser can report, by role. Only things the server cannot see on its own
 * (a signature checked in the browser, an export, a draft entry). Sign-ins, uploads, submissions,
 * consent and case actions are logged by the server and cannot be posted here.
 */
const ALLOWED: Partial<Record<Category, Role[]>> = {
  Verification: ['verifier'],
  Reports: ['aicte_bureau', 'aicte_regional'],
  Administration: ['aicte_admin', 'aicte_bureau'],
  Data: ['inst_admin', 'inst_operator'],
}

const Event = z.object({
  category: z.enum(Object.keys(ALLOWED) as [Category, ...Category[]]),
  action: z.string().min(1).max(120),
  detail: z.string().max(500).default(''),
})

export function auditRoutes() {
  const r = Router()
  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many events' } })

  r.post('/', requireAuth, limiter, handler(async (req, res) => {
    const e = parse(Event, req.body)
    if (!ALLOWED[e.category]!.includes(req.user!.role)) throw forbidden('Your role cannot record this kind of event')
    await audit(req.db, req.user!, { category: e.category, action: e.action, detail: e.detail, entity: 'client' })
    res.status(201).json({ ok: true })
  }))

  return r
}
