import express from 'express'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import helmet from 'helmet'
import path from 'node:path'
import fs from 'node:fs'
import { sql } from 'drizzle-orm'
import type { Db } from './db/client'
import { loadSession } from './lib/auth'
import { errorHandler, notFound } from './lib/http'
import { authRoutes } from './routes/auth'
import { instRoutes } from './routes/inst'
import { aicteRoutes } from './routes/aicte'
import { studentRoutes } from './routes/student'
import { verifierRoutes } from './routes/verifier'
import { publicRoutes } from './routes/public'

export interface AppOptions {
  db: Db
  /** Folder with the built frontend. Served with SPA fallback when it exists. */
  staticDir?: string
  loginLimit?: number
}

export function createApp({ db, staticDir, loginLimit }: AppOptions) {
  const app = express()
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'blob:'],
        'media-src': ["'self'", 'blob:'],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'worker-src': ["'self'", 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }))
  app.use(compression())
  app.use(cookieParser())
  app.use(express.json({ limit: '8mb' }))
  app.use((req, _res, next) => { req.db = db; next() })

  const api = express.Router()
  api.get('/health', async (_req, res) => {
    try {
      await db.execute(sql`select 1`)
      res.json({ status: 'ok', db: 'up', time: new Date().toISOString() })
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' })
    }
  })
  api.use(loadSession)
  api.use('/auth', authRoutes({ loginLimit }))
  api.use('/inst', instRoutes())
  api.use('/aicte', aicteRoutes())
  api.use('/student', studentRoutes())
  api.use('/verifier', verifierRoutes())
  api.use('/public', publicRoutes())
  api.use((_req, _res, next) => next(notFound('No such API route')))
  api.use(errorHandler)
  app.use('/api', api)

  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h', setHeaders: (res, file) => {
      if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    } }))
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(staticDir, 'index.html'))
    })
  }

  app.use(errorHandler)
  return app
}
