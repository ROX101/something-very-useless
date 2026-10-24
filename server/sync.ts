import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

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

  if (url === '/api/reset' && req.method === 'POST') {
    state = {}
    save()
    broadcast({ reset: true })
    return json(res, { ok: true })
  }

  const m = url.match(/^\/api\/state\/([\w.-]+)$/)
  if (m && req.method === 'GET') return json(res, { value: state[m[1]] ?? null })
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
