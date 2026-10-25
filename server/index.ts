import path from 'node:path'
import { createApp } from './app'
import { createDb, createPool, runMigrations } from './db/client'
import { seed } from './db/seed'
import { env } from './env'

async function main() {
  const pool = createPool()
  const db = createDb(pool)

  await runMigrations(db)
  console.log('[db] migrations applied')
  if (env.seedOnBoot) {
    const r = await seed(db)
    console.log(r.seeded ? '[db] demo data seeded' : '[db] demo data already present')
  }

  const staticDir = process.env.STATIC_DIR ?? path.resolve(process.cwd(), 'dist')
  const app = createApp({ db, staticDir })
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`[api] listening on :${env.port} (${env.isProd ? 'production' : 'development'})`)
  })

  const shutdown = (signal: string) => {
    console.log(`[api] ${signal}, shutting down`)
    server.close(() => pool.end().then(() => process.exit(0)))
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[api] failed to start', err)
  process.exit(1)
})
