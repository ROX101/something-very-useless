import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const DIR = path.resolve('.data')
const FILE = path.join(DIR, 'state.json')

function load(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

let state = load()

interface AuditEntry { seq: number; at: string; actor: string; role: string; org: string; category: string; action: string; detail: string; prev: string; hash: string }
type AuditInput = Pick<AuditEntry, 'actor' | 'role' | 'org' | 'category' | 'action' | 'detail'> & { at?: string }

const AUDIT = 'as.audit'
const GENESIS = '0'.repeat(64)

export function canonical(e: Omit<AuditEntry, 'hash'>) {
  return [e.seq, e.at, e.actor, e.role, e.org, e.category, e.action, e.detail, e.prev].join('|')
}

function chain(list: AuditEntry[], input: AuditInput): AuditEntry {
  const last = list[list.length - 1]
  const base = { seq: list.length + 1, at: input.at ?? new Date().toISOString(), actor: input.actor, role: input.role, org: input.org, category: input.category, action: input.action, detail: input.detail, prev: last ? last.hash : GENESIS }
  return { ...base, hash: createHash('sha256').update(canonical(base)).digest('hex') }
}

const SEED: AuditInput[] = [
  { at: '2026-10-24T08:00:00+05:30', actor: 'System', role: 'System', org: 'AICTE', category: 'System', action: 'Audit trail started', detail: 'Hash chain created for AY 2026-27' },
  { at: '2026-10-24T08:15:00+05:30', actor: 'AICTE IT Cell', role: 'AICTE Administrator', org: 'AICTE IT Cell', category: 'Administration', action: 'Rule pack deployed', detail: 'APH 2024-27 rule pack for AY 2026-27' },
  { at: '2026-10-24T10:12:00+05:30', actor: 'Dr. Arvind Saxena', role: 'Institution Admin (Nodal Officer)', org: 'Meghavarsha Institute of Technology', category: 'Submission', action: 'Submitted enrolment data', detail: 'Receipt AS-26-0932-0044, 612 records' },
  { at: '2026-10-24T13:40:00+05:30', actor: 'Prof. K. Senthil', role: 'Institution Admin (Nodal Officer)', org: 'Ilavelir Tech College', category: 'Submission', action: 'Submitted enrolment data', detail: 'Receipt AS-26-1247-0018, 388 records' },
  { at: '2026-10-24T15:05:00+05:30', actor: 'Dr. Meera Sahu', role: 'Institution Admin (Nodal Officer)', org: 'Trivikram College of Engineering', category: 'Submission', action: 'Submitted enrolment data', detail: 'Receipt AS-26-1105-0027, 540 records' },
  { at: '2026-10-24T16:20:00+05:30', actor: 'System', role: 'System', org: 'AICTE', category: 'Compliance', action: 'Duplicate ring detected', detail: '38 students enrolled at Meghavarsha and at three other institutions' },
]

function seedAudit(): AuditEntry[] {
  const list: AuditEntry[] = []
  for (const s of SEED) list.push(chain(list, s))
  return list
}

function audit(): AuditEntry[] {
  if (!Array.isArray(state[AUDIT])) { state[AUDIT] = seedAudit(); save() }
  return state[AUDIT] as AuditEntry[]
}
const clients = new Set<ServerResponse>()

function save() {
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(state))
}

function broadcast(msg: unknown) {
  const line = `data: ${JSON.stringify(msg)}\n\n`
  for (const c of clients) c.write(line)
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, value: unknown, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(value))
}

async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = req.url ?? ''
  if (!url.startsWith('/api/')) return next()

  if (url === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    res.write('retry: 2000\n\n')
    clients.add(res)
    const ping = setInterval(() => res.write(': ping\n\n'), 20000)
    req.on('close', () => { clearInterval(ping); clients.delete(res) })
    return
  }

  if (url === '/api/audit' && req.method === 'POST') {
    try {
      const input = JSON.parse(await body(req)) as AuditInput
      const list = audit()
      const entry = chain(list, { actor: String(input.actor ?? ''), role: String(input.role ?? ''), org: String(input.org ?? ''), category: String(input.category ?? ''), action: String(input.action ?? ''), detail: String(input.detail ?? '') })
      list.push(entry)
      save()
      broadcast({ key: AUDIT, value: list, from: '' })
      return json(res, entry)
    } catch {
      return json(res, { ok: false }, 400)
    }
  }

  if (url === '/api/reset' && req.method === 'POST') {
    const fresh = seedAudit()
    fresh.push(chain(fresh, { actor: 'System', role: 'System', org: 'AICTE', category: 'System', action: 'Demo data reset', detail: 'Uploads, submissions, consents and case decisions cleared' }))
    state = { [AUDIT]: fresh }
    save()
    broadcast({ reset: true })
    return json(res, { ok: true })
  }

  const m = url.match(/^\/api\/state\/([\w.-]+)$/)
  if (m && req.method === 'GET') return json(res, { value: m[1] === AUDIT ? audit() : state[m[1]] ?? null })
  if (m && req.method === 'PUT' && m[1] === AUDIT) return json(res, { ok: false }, 403)
  if (m && req.method === 'PUT') {
    try {
      const value = JSON.parse(await body(req)) as unknown
      state[m[1]] = value
      save()
      broadcast({ key: m[1], value, from: req.headers['x-client'] ?? '' })
      return json(res, { ok: true })
    } catch {
      return json(res, { ok: false }, 400)
    }
  }
  return json(res, { error: 'not found' }, 404)
}

export function syncServer(): Plugin {
  return {
    name: 'apaar-sathi-sync',
    configureServer(server) {
      server.middlewares.use((req, res, next) => { void handle(req, res, next) })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => { void handle(req, res, next) })
    },
  }
}
