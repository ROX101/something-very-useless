import { createDb, createPool, runMigrations } from './client'
import { seed } from './seed'

const cmd = process.argv[2]

async function main() {
  const pool = createPool()
  const db = createDb(pool)
  try {
    if (cmd === 'migrate') {
      await runMigrations(db)
      console.log('migrations applied')
    } else if (cmd === 'seed') {
      await runMigrations(db)
      const r = await seed(db, { force: process.argv.includes('--reset') })
      console.log(r.seeded ? 'demo data seeded' : 'already seeded (use --reset to wipe and reseed)')
    } else {
      console.log('usage: tsx server/db/cli.ts <migrate|seed [--reset]>')
      process.exitCode = 1
    }
  } finally {
    await pool.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
