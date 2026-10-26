import { and, asc, eq, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import { enrolments, studentEvents, type StudentEventData } from '../db/schema'
import { normaliseName } from '../../src/inst/engine/similarity'

type Tx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]
export type Event = typeof studentEvents.$inferSelect
export const EVENT_TYPES = ['withdrawn', 'transferred', 'name_corrected', 'lateral_entry', 'reinstated'] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_LABEL: Record<EventType, string> = {
  withdrawn: 'Withdrawn', transferred: 'Transferred out', name_corrected: 'Name corrected', lateral_entry: 'Lateral entry', reinstated: 'Reinstated',
}

const match = (pid: string, ay: string, instStudentId: string) =>
  and(eq(enrolments.institutionPid, pid), eq(enrolments.ay, ay), eq(enrolments.instStudentId, instStudentId))

/** Applies one event to the enrolment register. */
export async function applyEvent(db: Tx, e: Pick<Event, 'institutionPid' | 'ay' | 'type' | 'instStudentId' | 'apaar' | 'date' | 'note' | 'data'>, inst: { name: string; city: string }) {
  const where = match(e.institutionPid, e.ay, e.instStudentId)
  const d: StudentEventData = e.data ?? {}
  switch (e.type as EventType) {
    case 'withdrawn':
      await db.update(enrolments).set({ status: 'withdrawn', statusDate: e.date, statusNote: e.note }).where(where); break
    case 'transferred':
      await db.update(enrolments).set({ status: 'transferred', statusDate: e.date, statusNote: [d.toInstitution && `to ${d.toInstitution}`, e.note].filter(Boolean).join(', ') }).where(where); break
    case 'reinstated':
      await db.update(enrolments).set({ status: 'active', statusDate: e.date, statusNote: e.note }).where(where); break
    case 'name_corrected':
      await db.update(enrolments).set({ name: d.newName, nameKey: normaliseName(d.newName ?? '') }).where(where); break
    case 'lateral_entry':
      await db.delete(enrolments).where(where)
      await db.insert(enrolments).values({
        apaar: e.apaar, institutionPid: e.institutionPid, institution: inst.name, city: inst.city, ay: e.ay, programme: d.programme ?? null,
        instStudentId: e.instStudentId, name: d.name ?? null, nameKey: normaliseName(d.name ?? ''), dob: d.dob ?? null, gender: d.gender ?? null,
        category: d.category ?? null, quota: d.quota ?? 'REGULAR', foreign: d.foreign ?? false, entry: 'lateral', statusDate: e.date, statusNote: e.note,
      }).onConflictDoNothing()
      break
  }
}

/** Re-applies every recorded event after the roster is rebuilt from a (re)submission. */
export async function replayEvents(db: Tx, pid: string, ay: string, inst: { name: string; city: string }) {
  const list = await db.select().from(studentEvents).where(and(eq(studentEvents.institutionPid, pid), eq(studentEvents.ay, ay))).orderBy(asc(studentEvents.id))
  for (const e of list) await applyEvent(db, e, inst)
  return list.length
}

export const findEnrolment = (db: Tx, pid: string, ay: string, idOrApaar: string) =>
  db.query.enrolments.findFirst({
    where: and(eq(enrolments.institutionPid, pid), eq(enrolments.ay, ay), or(eq(enrolments.instStudentId, idOrApaar), eq(enrolments.apaar, idOrApaar))),
  })
