import { and, desc, eq } from 'drizzle-orm'
import type { UploadRow } from '../../src/inst/engine/types'
import type { Db } from '../db/client'
import { uploads } from '../db/schema'
import { audit, type Who } from '../lib/audit'
import type { SessionUser } from '../lib/auth'

export async function currentUpload(db: Db, pid: string) {
  const [u] = await db.select().from(uploads).where(and(eq(uploads.institutionPid, pid), eq(uploads.current, true))).orderBy(desc(uploads.id)).limit(1)
  return u ?? null
}

/** Starts a new working upload for the institution (the previous one stops being current). */
export async function createUpload(db: Db, who: Who | SessionUser, pid: string, fileName: string, rows: UploadRow[], via: 'portal' | 'api' = 'portal', uploadedBy = who.userId) {
  return db.transaction(async (tx) => {
    await tx.update(uploads).set({ current: false }).where(and(eq(uploads.institutionPid, pid), eq(uploads.current, true)))
    const [u] = await tx.insert(uploads).values({ institutionPid: pid, fileName, uploadedBy, rows }).returning()
    await audit(tx, who, {
      category: 'Data',
      action: via === 'api' ? 'Received enrolment batch by API' : fileName.startsWith('Manual entry') ? 'Sent manual entries for validation' : 'Uploaded enrolment file',
      detail: `${fileName}, ${rows.length} rows`, entity: 'upload', entityId: String(u.id),
    })
    return u
  })
}

/** Adds rows to the current upload, numbering them after the existing ones. Creates the upload if there is none. */
export async function appendRows(db: Db, who: Who, pid: string, fileName: string, rows: UploadRow[], uploadedBy: string) {
  const u = await currentUpload(db, pid)
  if (!u) return createUpload(db, who, pid, fileName, rows.map((r, i) => ({ ...r, rowNo: i + 2 })), 'api', uploadedBy)
  const start = u.rows.reduce((m, r) => Math.max(m, r.rowNo), 1) + 1
  const all = [...u.rows, ...rows.map((r, i) => ({ ...r, rowNo: start + i }))]
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(uploads).set({ rows: all, updatedAt: new Date().toISOString() }).where(eq(uploads.id, u.id)).returning()
    await audit(tx, who, { category: 'Data', action: 'Received enrolment batch by API', detail: `${u.fileName}, +${rows.length} rows, ${all.length} rows now`, entity: 'upload', entityId: String(u.id) })
    return updated
  })
}
