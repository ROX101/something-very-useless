import { and, eq, inArray, ne, or } from 'drizzle-orm'
import { runRules, type RuleContext } from '../../src/inst/engine/rules'
import type { UploadRow } from '../../src/inst/engine/types'
import type { Db } from '../db/client'
import { apaarRegistry, enrolments, programmes } from '../db/schema'

const clean = (s: string) => s.replace(/\s/g, '')

/** Builds the rule context from the database, scoped to the identities present in this upload. */
export async function buildContext(db: Db, institutionPid: string, rows: UploadRow[]): Promise<RuleContext> {
  const apaars = [...new Set(rows.map((r) => clean(r.APAAR_ID)).filter((a) => /^\d{12}$/.test(a)))]
  const dobs = [...new Set(rows.map((r) => r.DOB).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))]

  const [progs, registry, others, sameDob] = await Promise.all([
    db.select().from(programmes).where(eq(programmes.institutionPid, institutionPid)),
    apaars.length || dobs.length
      ? db.select().from(apaarRegistry).where(or(
        apaars.length ? inArray(apaarRegistry.apaar, apaars) : undefined,
        dobs.length ? inArray(apaarRegistry.dob, dobs) : undefined,
      ))
      : Promise.resolve([]),
    apaars.length
      ? db.select().from(enrolments).where(and(inArray(enrolments.apaar, apaars), ne(enrolments.institutionPid, institutionPid), eq(enrolments.status, 'active')))
      : Promise.resolve([]),
    // Candidates for R11 (probable duplicates): active students elsewhere born on the same days.
    dobs.length
      ? db.select().from(enrolments).where(and(inArray(enrolments.dob, dobs), ne(enrolments.institutionPid, institutionPid), eq(enrolments.status, 'active'))).limit(20000)
      : Promise.resolve([]),
  ])

  return {
    institutionPid,
    programmes: progs.map((p) => ({ code: p.code, label: p.label, name: p.name, intake: p.intake })),
    registry: registry.map((e) => ({ apaar: e.apaar, name: e.name, dob: e.dob, gender: e.gender })),
    otherEnrolments: others.filter((e) => e.apaar).map((e) => ({ apaar: e.apaar!, pid: e.institutionPid, institution: e.institution, city: e.city, ay: e.ay })),
    probable: sameDob.filter((e) => e.name && e.dob).map((e) => ({
      name: e.name!, dob: e.dob!, gender: e.gender, apaar: e.apaar, instStudentId: e.instStudentId,
      pid: e.institutionPid, institution: e.institution, city: e.city, ay: e.ay,
    })),
  }
}

export async function validate(db: Db, institutionPid: string, rows: UploadRow[]) {
  return runRules(rows, await buildContext(db, institutionPid, rows))
}
