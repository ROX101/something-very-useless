import { create } from 'zustand'
import { useMemo } from 'react'
import type { OtherEnrolment, UploadRow } from './engine/types'
import { runRules } from './engine/rules'
import { RULE_CONTEXT } from './data/dataset'
import { api } from '../api'
import { onSignOut } from '../store'

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

interface Data {
  fileName: string | null
  rows: UploadRow[] | null
  uploadedAt: string | null
  fixesApplied: number
  submissions: Submission[]
  /** Students in this upload who are enrolled at another institution, as known to the server (R10). */
  crossEnrolments: OtherEnrolment[]
  loaded: boolean
  /** Last failed save, shown by InstLayout so nothing fails silently. */
  error: string | null
}

interface InstState extends Data {
  hydrate: () => Promise<void>
  setUpload: (fileName: string, rows: UploadRow[]) => void
  setRows: (rows: UploadRow[], fixes: number) => void
  clearUpload: () => void
  submit: () => Promise<Submission>
  dismissError: () => void
}

const empty: Data = { fileName: null, rows: null, uploadedAt: null, fixesApplied: 0, submissions: [], crossEnrolments: [], loaded: false, error: null }

// Writes are queued so a fix applied right after an upload never reaches the server before the upload itself.
let queue: Promise<unknown> = Promise.resolve()
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const p = queue.then(job, job)
  queue = p.catch(() => undefined)
  return p
}

export const useInst = create<InstState>((set, get) => ({
  ...empty,

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

  setRows: (rows, fixes) => {
    set({ rows, fixesApplied: get().fixesApplied + fixes, error: null })
    enqueue(() => api.put<{ fixesApplied: number; crossEnrolments: OtherEnrolment[] }>('/inst/uploads/current/rows', { rows, fixes }))
      .then((r) => set({ fixesApplied: r.fixesApplied, crossEnrolments: r.crossEnrolments }))
      .catch((e: Error) => set({ error: `Fix was not saved: ${e.message}` }))
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

onSignOut(() => useInst.setState(empty))

/** Instant in-browser preview. The server re-runs the same rules on submit and its result is authoritative. */
export function useValidation() {
  const rows = useInst((s) => s.rows)
  const crossEnrolments = useInst((s) => s.crossEnrolments)
  return useMemo(
    () => (rows ? runRules(rows, { ...RULE_CONTEXT, otherEnrolments: crossEnrolments }) : null),
    [rows, crossEnrolments],
  )
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
