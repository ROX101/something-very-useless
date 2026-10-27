import path from 'node:path'
import { createApp } from './app'
import { createDb, createPool, runMigrations } from './db/client'
import { seed, upgradeSeed } from './db/seed'
import { env } from './env'
import { repairIssuerKeys } from './services/credentials'

async function main() {
  const pool = createPool()
  const db = createDb(pool)

  await runMigrations(db)
  console.log('[db] migrations applied')
  if (env.seedOnBoot) {
    const r = await seed(db)
    console.log(r.seeded ? '[db] demo data seeded' : '[db] demo data already present')
  }
  const rotated = await repairIssuerKeys(db)
  if (rotated.length) console.warn(`[keys] SIGNING_KEY_SECRET changed: new signing keys for ${rotated.join(', ')}, certificates re-signed`)
  if (env.seedOnBoot) {
    const u = await upgradeSeed(db)
    if (u.upgraded.length) console.log(`[db] demo data upgraded: ${u.upgraded.join(', ')}`)
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
