import { sql } from 'drizzle-orm'
import type { Db } from '../db/client'

type Exec = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

/** Atomically increments a named counter and returns the new value. */
export async function next(db: Exec, name: string, start = 1): Promise<number> {
  const r = await db.execute<{ value: number }>(sql`
    insert into counters (name, value) values (${name}, ${start})
    on conflict (name) do update set value = counters.value + 1
    returning value`)
  return r.rows[0].value
}
