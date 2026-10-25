import { create } from 'zustand'
import { useMemo } from 'react'
import type { UploadRow } from './engine/types'
import { runRules } from './engine/rules'
import { RULE_CONTEXT } from './data/dataset'
import { push, shared } from '../sync'
import { audit } from '../audit/log'

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
  draft: UploadRow[]
}

interface InstState extends Persisted {
  setUpload: (fileName: string, rows: UploadRow[]) => void
  setRows: (rows: UploadRow[], fixes: number) => void
  clearUpload: () => void
  addSubmission: (s: Submission) => void
  saveRow: (row: UploadRow) => void
  setDraft: (draft: UploadRow[], note?: { action: string; detail: string }) => void
}

const KEY = 'as.inst.1-9000417'
const empty: Persisted = { fileName: null, rows: null, uploadedAt: null, fixesApplied: 0, submissions: [], draft: [] }

function load(): Persisted {
  try {
    const v = localStorage.getItem(KEY)
    return v ? { ...empty, ...(JSON.parse(v) as Persisted) } : empty
  } catch {
    return empty
  }
}
function store(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    return
  }
}

function save(p: Persisted) {
  store(p)
  push(KEY, p)
}

const pick = (s: InstState): Persisted => ({
  fileName: s.fileName, rows: s.rows, uploadedAt: s.uploadedAt, fixesApplied: s.fixesApplied, submissions: s.submissions, draft: s.draft,
})

export const useInst = create<InstState>((set, get) => ({
  ...load(),
  setUpload: (fileName, rows) => { audit('Data', fileName.startsWith('Manual entry') ? 'Sent manual entries for validation' : 'Uploaded enrolment file', `${fileName}, ${rows.length} rows`); set({ fileName, rows, uploadedAt: new Date().toISOString(), fixesApplied: 0 }); save(pick(get())) },
  setRows: (rows, fixes) => { audit('Data', fixes > 1 ? 'Applied suggested fixes' : 'Fixed a row', `${fixes} change${fixes === 1 ? '' : 's'}, ${rows.length} rows now`); set({ rows, fixesApplied: get().fixesApplied + fixes }); save(pick(get())) },
  clearUpload: () => { audit('Data', 'Removed uploaded file', get().fileName ?? ''); set({ fileName: null, rows: null, uploadedAt: null, fixesApplied: 0 }); save(pick(get())) },
  saveRow: (row) => {
    const rows = get().rows ?? []
    const exists = rows.some((r) => r.rowNo === row.rowNo)
    audit('Data', exists ? 'Edited student record' : 'Added student record', `Row ${row.rowNo}, ${row.INST_STUDENT_ID}, ${row.NAME}`)
    set({ rows: exists ? rows.map((r) => (r.rowNo === row.rowNo ? row : r)) : [...rows, row] })
    save(pick(get()))
  },
  setDraft: (draft, note) => {
    if (note) audit('Data', note.action, note.detail)
    set({ draft })
    save(pick(get()))
  },
  addSubmission: (s) => { audit('Submission', 'Submitted enrolment data to AICTE', `Receipt ${s.receiptNo}, ${s.records} records, ${s.alerts} compliance alerts, SHA-256 ${s.hash.slice(0, 16)}`); set({ submissions: [s, ...get().submissions] }); save(pick(get())) },
}))

export function useValidation() {
  const rows = useInst((s) => s.rows)
  return useMemo(() => (rows ? runRules(rows, RULE_CONTEXT) : null), [rows])
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

shared(KEY, (v) => { const p = { ...empty, ...(v as Persisted) }; useInst.setState(p); store(p) }, () => pick(useInst.getState()))
