import { create } from 'zustand'
import { useMemo } from 'react'
import type { OtherEnrolment, UploadRow } from './engine/types'
import { runRules } from './engine/rules'
import { PREVIEW_CONTEXT } from './data/dataset'
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

interface ServerState {
  crossEnrolments: OtherEnrolment[]
  upload: { id: number; fileName: string; rows: UploadRow[]; uploadedAt: string; fixesApplied: number } | null
  submissions: Submission[]
}

/** Describes a change for the audit trail, e.g. "Edited student record". */
export interface Note { action: string; detail: string }

interface Data {
  fileName: string | null
  rows: UploadRow[] | null
  uploadedAt: string | null
  fixesApplied: number
  submissions: Submission[]
  /** Students in this upload who are enrolled at another institution, as known to the server (R10). */
  crossEnrolments: OtherEnrolment[]
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

const empty: Data = { fileName: null, rows: null, uploadedAt: null, fixesApplied: 0, submissions: [], crossEnrolments: [], draft: [], loaded: false, error: null }

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
      set({
        fileName: s.upload?.fileName ?? null,
        rows: s.upload?.rows ?? null,
        uploadedAt: s.upload?.uploadedAt ?? null,
        fixesApplied: s.upload?.fixesApplied ?? 0,
        submissions: s.submissions,
        crossEnrolments: s.crossEnrolments,
        loaded: true,
      })
    } catch (e) {
      set({ loaded: true, error: (e as Error).message })
    }
  },

  setUpload: (fileName, rows) => {
    set({ fileName, rows, uploadedAt: new Date().toISOString(), fixesApplied: 0, crossEnrolments: [], error: null })
    enqueue(() => api.post<{ upload: { uploadedAt: string }; crossEnrolments: OtherEnrolment[] }>('/inst/uploads', { fileName, rows }))
      .then((r) => set({ uploadedAt: r.upload.uploadedAt, crossEnrolments: r.crossEnrolments }))
      .catch((e: Error) => set({ error: `Upload was not saved: ${e.message}` }))
  },

  setRows: (rows, fixes, note) => {
    set({ rows, fixesApplied: get().fixesApplied + fixes, error: null })
    enqueue(() => api.put<{ fixesApplied: number; crossEnrolments: OtherEnrolment[] }>('/inst/uploads/current/rows', { rows, fixes, note }))
      .then((r) => set({ fixesApplied: r.fixesApplied, crossEnrolments: r.crossEnrolments }))
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

  clearUpload: () => {
    set({ fileName: null, rows: null, uploadedAt: null, fixesApplied: 0, crossEnrolments: [], error: null })
    enqueue(() => api.del('/inst/uploads/current')).catch((e: Error) => set({ error: e.message }))
  },

  submit: async () => {
    const s = await enqueue(() => api.post<Submission>('/inst/submissions', { declaration: true }))
    set({ submissions: [s, ...get().submissions] })
    return s
  },

  dismissError: () => set({ error: null }),
}))

onSignOut(() => { writeDraft([]); useInst.setState({ ...empty, draft: [] }) })

/** Instant in-browser preview. The server re-runs the same rules on submit and its result is authoritative. */
export function useValidation() {
  const rows = useInst((s) => s.rows)
  const crossEnrolments = useInst((s) => s.crossEnrolments)
  return useMemo(
    () => (rows ? runRules(rows, { ...PREVIEW_CONTEXT, otherEnrolments: crossEnrolments }) : null),
    [rows, crossEnrolments],
  )
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
