import bcrypt from 'bcryptjs'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { ACCOUNTS, DEMO_PASSWORD, type Role } from '../../src/auth/directory'
import { generateDataset } from '../../src/inst/data/generate'
import { INSTITUTION, PROGRAMMES } from '../../src/inst/data/reference'
import { createIssuer } from '../lib/signing'
import { issueCredential } from '../services/credentials'
import type { Db } from './client'
import * as t from './schema'

export const STUDENT_APAAR = '447120936618'
export const GTU_DID = 'did:web:godavaritu.edu.in'

const USER_LINKS: Partial<Record<Role, { institutionPid?: string; apaar?: string; states?: string[]; issuerDid?: string; mobile?: string }>> = {
  university: { issuerDid: GTU_DID },
  inst_admin: { institutionPid: INSTITUTION.pid },
  inst_operator: { institutionPid: INSTITUTION.pid },
  student: { apaar: STUDENT_APAAR, mobile: '9822014321' },
  aicte_regional: { states: ['MH', 'GA'] },
}

const TABLES = [
  'statutory_access', 'otps', 'idempotency', 'api_keys', 'audit_log', 'issuers', 'registrations', 'access_log', 'verification_requests', 'alert_actions', 'compliance_alerts', 'submissions',
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
    await createIssuer(tx, { did: GTU_DID, name: INSTITUTION.university, short: 'GTU', city: 'Nashik' })
    await tx.insert(t.institutions).values([
      {
        pid: INSTITUTION.pid, name: INSTITUTION.name, city: INSTITUTION.city, state: 'MH',
        university: INSTITUTION.university, type: INSTITUTION.type, initials: INSTITUTION.initials,
        established: INSTITUTION.established, approval: INSTITUTION.approval, motto: INSTITUTION.motto,
        awardingDid: GTU_DID,
      },
    ])

    await tx.insert(t.programmes).values(PROGRAMMES.map((p) => ({ ...p, institutionPid: INSTITUTION.pid })))

    await tx.insert(t.users).values(ACCOUNTS.map((a) => ({
      userId: a.userId, passwordHash: hash, name: a.name, role: a.role, org: a.org, scope: a.scope,
      institutionPid: USER_LINKS[a.role]?.institutionPid ?? null,
      apaar: USER_LINKS[a.role]?.apaar ?? null,
      states: USER_LINKS[a.role]?.states ?? [],
      issuerDid: USER_LINKS[a.role]?.issuerDid ?? null,
      mobile: USER_LINKS[a.role]?.mobile ?? null,
    })))

    const registry = [
      ...dataset.registry,
      { apaar: STUDENT_APAAR, name: 'Ritika Deshmukh', dob: '2004-03-14', gender: 'F' },
    ]
    for (let i = 0; i < registry.length; i += 500) {
      await tx.insert(t.apaarRegistry).values(registry.slice(i, i + 500)).onConflictDoNothing()
    }

    await tx.insert(t.counters).values([
      { name: 'consent', value: 7730 },
      { name: 'request', value: 1000 },
      { name: `receipt:${INSTITUTION.pid}`, value: 90 },
      // the demo degree keeps its familiar number and status-list position
      { name: `status:${GTU_DID}`, value: 416 },
    ])
    await issueCredential(tx, {
      issuerDid: GTU_DID, certNo: 'GTU-2026-CSE-0417', apaar: STUDENT_APAAR, holderName: 'Ritika Deshmukh', studentId: 'GTU/2022/CSE/0417',
      programmeCode: 'CSE', degree: 'B.Tech, Computer Science & Engineering', year: 2026, cgpa: '8.42', division: 'First Class with Distinction',
      issuedAt: '2026-07-15T10:00:00+05:30',
    }, 'registrar@godavaritu.edu.in')

  })

  return { seeded: true }
}

/**
 * Brings a database seeded by an earlier version up to date without touching real activity:
 * registers the demo university as an issuer, adds demo accounts that did not exist yet, links Aranya to its
 * university, and re-issues the demo degree with the server's own key (old rows lacked the public summary).
 */
export async function upgradeSeed(db: Db) {
  if (!(await isSeeded(db))) return { upgraded: [] as string[] }
  const done: string[] = []
  await db.transaction(async (tx) => {
    if (!(await tx.query.issuers.findFirst({ where: eq(t.issuers.did, GTU_DID) }))) {
      await createIssuer(tx, { did: GTU_DID, name: INSTITUTION.university, short: 'GTU', city: 'Nashik' })
      done.push('issuer')
    }
    const have = new Set((await tx.select({ id: t.users.userId }).from(t.users)).map((u) => u.id))
    const missing = ACCOUNTS.filter((a) => !have.has(a.userId))
    if (missing.length) {
      const hash = await bcrypt.hash(DEMO_PASSWORD, 10)
      await tx.insert(t.users).values(missing.map((a) => ({
        userId: a.userId, passwordHash: hash, name: a.name, role: a.role, org: a.org, scope: a.scope,
        institutionPid: USER_LINKS[a.role]?.institutionPid ?? null, apaar: USER_LINKS[a.role]?.apaar ?? null,
        states: USER_LINKS[a.role]?.states ?? [], issuerDid: USER_LINKS[a.role]?.issuerDid ?? null, mobile: USER_LINKS[a.role]?.mobile ?? null,
      })))
      done.push(`accounts:${missing.map((a) => a.role).join(',')}`)
    }
    await tx.update(t.users).set({ mobile: USER_LINKS.student!.mobile! }).where(and(eq(t.users.userId, STUDENT_APAAR), isNull(t.users.mobile)))
    await tx.update(t.institutions).set({ awardingDid: GTU_DID }).where(and(eq(t.institutions.pid, INSTITUTION.pid), isNull(t.institutions.awardingDid)))
    const demo = await tx.query.credentials.findFirst({ where: eq(t.credentials.certNo, 'GTU-2026-CSE-0417') })
    if (!demo || !demo.publicJws) {
      if (demo) await tx.delete(t.credentials).where(eq(t.credentials.certNo, 'GTU-2026-CSE-0417'))
      await tx.insert(t.counters).values({ name: `status:${GTU_DID}`, value: 416 }).onConflictDoNothing()
      await issueCredential(tx, {
        issuerDid: GTU_DID, certNo: 'GTU-2026-CSE-0417', apaar: STUDENT_APAAR, holderName: 'Ritika Deshmukh', studentId: 'GTU/2022/CSE/0417',
        programmeCode: 'CSE', degree: 'B.Tech, Computer Science & Engineering', year: 2026, cgpa: '8.42', division: 'First Class with Distinction',
        issuedAt: '2026-07-15T10:00:00+05:30',
      }, 'registrar@godavaritu.edu.in')
      done.push('demo-degree')
    }
  })
  return { upgraded: done }
}
