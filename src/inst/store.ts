import { create } from 'zustand'
import { useMemo } from 'react'
import type { UploadRow } from './engine/types'
import { runRules } from './engine/rules'
import { RULE_CONTEXT } from './data/dataset'

export interface Submission {
  receiptNo: string
  submittedAt: string
  submittedBy: string
  records: number
  alerts: number
  hash: string
  fileName: string
}

interface Persisted {
  fileName: string | null
  rows: UploadRow[] | null
  uploadedAt: string | null
  fixesApplied: number
  submissions: Submission[]
}

interface InstState extends Persisted {
  setUpload: (fileName: string, rows: UploadRow[]) => void
  setRows: (rows: UploadRow[], fixes: number) => void
  clearUpload: () => void
  addSubmission: (s: Submission) => void
}

const KEY = 'as.inst.1-9000417'
const empty: Persisted = { fileName: null, rows: null, uploadedAt: null, fixesApplied: 0, submissions: [] }

function load(): Persisted {
  try {
    const v = localStorage.getItem(KEY)
    return v ? { ...empty, ...(JSON.parse(v) as Persisted) } : empty
  } catch {
    return empty
  }
}
function save(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    return
  }
}

const pick = (s: InstState): Persisted => ({
  fileName: s.fileName, rows: s.rows, uploadedAt: s.uploadedAt, fixesApplied: s.fixesApplied, submissions: s.submissions,
})

export const useInst = create<InstState>((set, get) => ({
  ...load(),
  setUpload: (fileName, rows) => { set({ fileName, rows, uploadedAt: new Date().toISOString(), fixesApplied: 0 }); save(pick(get())) },
  setRows: (rows, fixes) => { set({ rows, fixesApplied: get().fixesApplied + fixes }); save(pick(get())) },
  clearUpload: () => { set({ fileName: null, rows: null, uploadedAt: null, fixesApplied: 0 }); save(pick(get())) },
  addSubmission: (s) => { set({ submissions: [s, ...get().submissions] }); save(pick(get())) },
}))

export function useValidation() {
  const rows = useInst((s) => s.rows)
  return useMemo(() => (rows ? runRules(rows, RULE_CONTEXT) : null), [rows])
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
