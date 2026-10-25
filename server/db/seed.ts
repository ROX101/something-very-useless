import bcrypt from 'bcryptjs'
import { sql } from 'drizzle-orm'
import { ACCOUNTS, DEMO_PASSWORD, type Role } from '../../src/auth/directory'
import { generateDataset } from '../../src/inst/data/generate'
import { INSTITUTION, PROGRAMMES } from '../../src/inst/data/reference'
import { GENUINE_JWS } from '../../src/verify/credentials'
import type { Db } from './client'
import * as t from './schema'

export const STUDENT_APAAR = '447120936618'

const USER_LINKS: Partial<Record<Role, { institutionPid?: string; apaar?: string; states?: string[] }>> = {
  inst_admin: { institutionPid: INSTITUTION.pid },
  inst_operator: { institutionPid: INSTITUTION.pid },
  student: { apaar: STUDENT_APAAR },
  aicte_regional: { states: ['MH', 'GA'] },
}

const TABLES = [
  'audit_log', 'registrations', 'access_log', 'verification_requests', 'alert_actions', 'compliance_alerts', 'submissions',
  'uploads', 'enrolments', 'credentials', 'apaar_registry', 'users', 'programmes', 'institutions', 'counters',
]

export async function resetDatabase(db: Db) {
  await db.execute(sql.raw(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`))
}

export async function isSeeded(db: Db) {
  const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from users`)
  return r.rows[0].n > 0
}

/**
 * Seeds only what the demo logins need to work: the 7 accounts, the Aranya institution and its programmes,
 * plus stand-ins for the external systems the app looks up (APAAR registry, the issued degree credential).
 * No activity data: alerts, consent requests, enrolments and submissions start empty.
 */
export async function seed(db: Db, { force = false } = {}) {
  if (!force && (await isSeeded(db))) return { seeded: false }
  if (force) await resetDatabase(db)

  const dataset = generateDataset()
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10)

  await db.transaction(async (tx) => {
    await tx.insert(t.institutions).values([
      {
        pid: INSTITUTION.pid, name: INSTITUTION.name, city: INSTITUTION.city, state: 'MH',
        university: INSTITUTION.university, type: INSTITUTION.type, initials: INSTITUTION.initials,
        established: INSTITUTION.established, approval: INSTITUTION.approval, motto: INSTITUTION.motto,
      },
    ])

    await tx.insert(t.programmes).values(PROGRAMMES.map((p) => ({ ...p, institutionPid: INSTITUTION.pid })))

    await tx.insert(t.users).values(ACCOUNTS.map((a) => ({
      userId: a.userId, passwordHash: hash, name: a.name, role: a.role, org: a.org, scope: a.scope,
      institutionPid: USER_LINKS[a.role]?.institutionPid ?? null,
      apaar: USER_LINKS[a.role]?.apaar ?? null,
      states: USER_LINKS[a.role]?.states ?? [],
    })))

    const registry = [
      ...dataset.registry,
      { apaar: STUDENT_APAAR, name: 'Ritika Deshmukh', dob: '2004-03-14', gender: 'F' },
    ]
    for (let i = 0; i < registry.length; i += 500) {
      await tx.insert(t.apaarRegistry).values(registry.slice(i, i + 500)).onConflictDoNothing()
    }

    await tx.insert(t.credentials).values({
      certNo: 'GTU-2026-CSE-0417', apaar: STUDENT_APAAR, jws: GENUINE_JWS, issuedAt: '2026-07-15T10:00:00+05:30',
    })

    await tx.insert(t.counters).values([
      { name: 'consent', value: 7730 },
      { name: 'request', value: 1000 },
      { name: `receipt:${INSTITUTION.pid}`, value: 90 },
    ])
  })

  return { seeded: true }
}
