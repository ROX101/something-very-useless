import { create } from 'zustand'
import { useMemo } from 'react'
import type { OtherEnrolment, ProbableMatch, Programme, UploadRow } from './engine/types'
import { runRules } from './engine/rules'
import { PREVIEW_CONTEXT } from './data/dataset'
import { INSTITUTION, PROGRAMMES } from './data/reference'
import { STATE_TILES } from '../aicte/states'
import { api } from '../api'
import { onSignOut } from '../store'
import { audit } from '../audit/log'

export interface Submission {
  receiptNo: string
  submittedAt: string
  submittedBy: string
  records: number
  alerts: number
  hash: string
  fileName: string
  status?: string
}

/** The signed-in institution, as the server knows it. */
export interface Institution {
  pid: string; name: string; city: string; state: string; university: string | null; type: string | null
  initials: string | null; established: number | null; approval: string | null; motto: string | null
}

/** How a row was changed in this upload: by a suggested fix, by hand, or added after the file. */
export type RowChange = 'fixed' | 'edited' | 'added'

interface ServerState {
  institution: Institution | null
  programmes: Programme[]
  crossEnrolments: OtherEnrolment[]
  probable: ProbableMatch[]
  upload: { id: number; fileName: string; rows: UploadRow[]; uploadedAt: string; fixesApplied: number } | null
  submissions: Submission[]
}

/** Describes a change for the audit trail, e.g. "Edited student record". */
export interface Note { action: string; detail: string }

interface Data {
  institution: Institution
  programmes: Programme[]
  /** Rows changed since the file was uploaded, for highlighting in the preview. */
  changes: Record<number, RowChange>
  fileName: string | null
  rows: UploadRow[] | null
  uploadedAt: string | null
  fixesApplied: number
  submissions: Submission[]
  /** Students in this upload who are enrolled at another institution, as known to the server (R10). */
  crossEnrolments: OtherEnrolment[]
  /** Students elsewhere who may be the same person (R11), as known to the server. */
  probable: ProbableMatch[]
  /** Manual entries not yet sent for validation. Kept in this browser only, like an unsaved form. */
  draft: UploadRow[]
  loaded: boolean
  /** Last failed save, shown by InstLayout so nothing fails silently. */
  error: string | null
}

interface InstState extends Data {
  hydrate: () => Promise<void>
  setUpload: (fileName: string, rows: UploadRow[]) => void
  setRows: (rows: UploadRow[], fixes: number, note?: Note) => void
  /** Adds a student row, or replaces the row with the same row number. */
  saveRow: (row: UploadRow) => void
  setDraft: (draft: UploadRow[], note?: Note) => void
  /** Removes rows from the current upload (wrongly entered students). */
  removeRows: (rowNos: number[]) => void
  clearUpload: () => void
  submit: () => Promise<Submission>
  dismissError: () => void
}

const DRAFT_KEY = 'as.inst.draft'
function readDraft(): UploadRow[] {
  try {
    const v = localStorage.getItem(DRAFT_KEY)
    return v ? (JSON.parse(v) as UploadRow[]) : []
  } catch {
    return []
  }
}
function writeDraft(d: UploadRow[]) {
  try {
    if (d.length) localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    return
  }
}

const CHANGES_KEY = 'as.inst.changes'
function readChanges(fileName: string | null): Record<number, RowChange> {
  try {
    const v = JSON.parse(localStorage.getItem(CHANGES_KEY) ?? 'null') as { fileName: string; changes: Record<number, RowChange> } | null
    return v && v.fileName === fileName ? v.changes : {}
  } catch {
    return {}
  }
}
function writeChanges(fileName: string | null, changes: Record<number, RowChange>) {
  try {
    if (fileName && Object.keys(changes).length) localStorage.setItem(CHANGES_KEY, JSON.stringify({ fileName, changes }))
    else localStorage.removeItem(CHANGES_KEY)
  } catch {
    return
  }
}

const FALLBACK_INSTITUTION: Institution = {
  pid: INSTITUTION.pid, name: INSTITUTION.name, city: INSTITUTION.city, state: INSTITUTION.state, university: INSTITUTION.university,
  type: INSTITUTION.type, initials: INSTITUTION.initials, established: INSTITUTION.established, approval: INSTITUTION.approval, motto: INSTITUTION.motto,
}

const empty: Data = { institution: FALLBACK_INSTITUTION, programmes: PROGRAMMES, changes: {}, fileName: null, rows: null, uploadedAt: null, fixesApplied: 0, submissions: [], crossEnrolments: [], probable: [], draft: [], loaded: false, error: null }

// Writes are queued so a fix applied right after an upload never reaches the server before the upload itself.
let queue: Promise<unknown> = Promise.resolve()
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const p = queue.then(job, job)
  queue = p.catch(() => undefined)
  return p
}

export const useInst = create<InstState>((set, get) => ({
  ...empty,
  draft: readDraft(),

  hydrate: async () => {
    try {
      await queue
      const s = await api.get<ServerState>('/inst/state')
      const fileName = s.upload?.fileName ?? null
      set({
        institution: s.institution ?? FALLBACK_INSTITUTION,
        programmes: s.programmes?.length ? s.programmes.map((p) => ({ code: p.code, label: p.label, name: p.name, intake: p.intake })) : PROGRAMMES,
        changes: readChanges(fileName),
        fileName,
        rows: s.upload?.rows ?? null,
        uploadedAt: s.upload?.uploadedAt ?? null,
        fixesApplied: s.upload?.fixesApplied ?? 0,
        submissions: s.submissions,
        crossEnrolments: s.crossEnrolments,
        probable: s.probable ?? [],
        loaded: true,
      })
    } catch (e) {
      set({ loaded: true, error: (e as Error).message })
    }
  },

  setUpload: (fileName, rows) => {
    writeChanges(null, {})
    set({ fileName, rows, uploadedAt: new Date().toISOString(), fixesApplied: 0, crossEnrolments: [], probable: [], changes: {}, error: null })
    enqueue(() => api.post<{ upload: { uploadedAt: string }; crossEnrolments: OtherEnrolment[]; probable: ProbableMatch[] }>('/inst/uploads', { fileName, rows }))
      .then((r) => set({ uploadedAt: r.upload.uploadedAt, crossEnrolments: r.crossEnrolments, probable: r.probable }))
      .catch((e: Error) => set({ error: `Upload was not saved: ${e.message}` }))
  },

  setRows: (rows, fixes, note) => {
    // Mark what changed, so the preview can highlight updated rows.
    const before = new Map((get().rows ?? []).map((r) => [r.rowNo, JSON.stringify(r)]))
    const changes = { ...get().changes }
    const kept = new Set(rows.map((r) => r.rowNo))
    for (const r of rows) {
      const old = before.get(r.rowNo)
      if (old === undefined) changes[r.rowNo] = 'added'
      else if (old !== JSON.stringify(r) && changes[r.rowNo] !== 'added') changes[r.rowNo] = fixes > 0 ? 'fixed' : 'edited'
    }
    for (const k of Object.keys(changes)) if (!kept.has(Number(k))) delete changes[Number(k)]
    writeChanges(get().fileName, changes)
    set({ rows, changes, fixesApplied: get().fixesApplied + fixes, error: null })
    enqueue(() => api.put<{ fixesApplied: number; crossEnrolments: OtherEnrolment[]; probable: ProbableMatch[] }>('/inst/uploads/current/rows', { rows, fixes, note }))
      .then((r) => set({ fixesApplied: r.fixesApplied, crossEnrolments: r.crossEnrolments, probable: r.probable }))
      .catch((e: Error) => set({ error: `Change was not saved: ${e.message}` }))
  },

  saveRow: (row) => {
    const rows = get().rows ?? []
    const exists = rows.some((r) => r.rowNo === row.rowNo)
    const next = exists ? rows.map((r) => (r.rowNo === row.rowNo ? row : r)) : [...rows, row]
    get().setRows(next, 0, {
      action: exists ? 'Edited student record' : 'Added student record',
      detail: `Row ${row.rowNo}, ${row.INST_STUDENT_ID}, ${row.NAME}`,
    })
  },

  setDraft: (draft, note) => {
    if (note) audit('Data', note.action, note.detail)
    writeDraft(draft)
    set({ draft })
  },

  removeRows: (rowNos) => {
    const gone = new Set(rowNos)
    const rows = get().rows ?? []
    const removed = rows.filter((r) => gone.has(r.rowNo))
    if (!removed.length) return
    get().setRows(rows.filter((r) => !gone.has(r.rowNo)), 0, {
      action: removed.length === 1 ? 'Removed student record' : 'Removed student records',
      detail: removed.length === 1
        ? `Row ${removed[0].rowNo}, ${removed[0].INST_STUDENT_ID}, ${removed[0].NAME}`
        : `${removed.length} rows: ${removed.slice(0, 10).map((r) => r.rowNo).join(', ')}${removed.length > 10 ? '…' : ''}`,
    })
  },

  clearUpload: () => {
    writeChanges(null, {})
    set({ changes: {}, fileName: null, rows: null, uploadedAt: null, fixesApplied: 0, crossEnrolments: [], probable: [], error: null })
    enqueue(() => api.del('/inst/uploads/current')).catch((e: Error) => set({ error: e.message }))
  },

  submit: async () => {
    const s = await enqueue(() => api.post<Submission>('/inst/submissions', { declaration: true }))
    set({ submissions: [s, ...get().submissions] })
    return s
  },

  dismissError: () => set({ error: null }),
}))

onSignOut(() => { writeDraft([]); writeChanges(null, {}); useInst.setState({ ...empty, draft: [] }) })

export const stateName = (code: string) => STATE_TILES.find((t) => t.code === code)?.name ?? code

/** Rule context for this institution's preview: its own programmes and intakes, plus what the server reported. */
export function usePreviewContext() {
  const programmes = useInst((s) => s.programmes)
  const pid = useInst((s) => s.institution.pid)
  return useMemo(() => ({ ...PREVIEW_CONTEXT, institutionPid: pid, programmes }), [pid, programmes])
}

/** Instant in-browser preview. The server re-runs the same rules on submit and its result is authoritative. */
export function useValidation() {
  const rows = useInst((s) => s.rows)
  const crossEnrolments = useInst((s) => s.crossEnrolments)
  const probable = useInst((s) => s.probable)
  const ctx = usePreviewContext()
  return useMemo(
    () => (rows ? runRules(rows, { ...ctx, otherEnrolments: crossEnrolments, probable }) : null),
    [rows, crossEnrolments, probable, ctx],
  )
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
