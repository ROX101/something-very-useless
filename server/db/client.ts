import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import path from 'node:path'
import * as schema from './schema'
import { env } from '../env'

export function createPool(url = env.databaseUrl) {
  return new pg.Pool({
    connectionString: url,
    max: 10,
    ssl: env.dbSsl ? { rejectUnauthorized: false } : undefined,
  })
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool, { schema })
}

export type Db = ReturnType<typeof createDb>

export async function runMigrations(db: Db) {
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'server/db/migrations')
  await migrate(db, { migrationsFolder })
}
