import type { Column, UploadRow } from './engine/types'
import { EXCEPTION_CODES } from './engine/types'
import { PROGRAMMES } from './data/reference'

export interface FieldDef {
  col: Column
  label: string
  required: boolean
  kind: 'text' | 'date' | 'select'
  options?: { value: string; label: string }[]
  placeholder?: string
  format: string
  example: string
}

const yn = [{ value: 'N', label: 'No' }, { value: 'Y', label: 'Yes' }]

export const FIELDS: FieldDef[] = [
  { col: 'APAAR_ID', label: 'APAAR ID', required: false, kind: 'text', placeholder: '4471 2093 6618', format: '12 digits. Leave blank only with an APAAR exception code', example: '447120936618' },
  { col: 'APAAR_EXCEPTION', label: 'APAAR exception', required: false, kind: 'select', format: 'Blank, or CONSENT_REFUSED, FOREIGN_NATIONAL, GENERATION_PENDING', example: '',
    options: [{ value: '', label: 'None' }, ...EXCEPTION_CODES.map((c) => ({ value: c, label: c.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (m) => m.toUpperCase()) }))] },
  { col: 'INST_STUDENT_ID', label: 'Institution student ID', required: true, kind: 'text', placeholder: 'ARN26CSE181', format: 'Your college roll or registration number', example: 'ARN26CSE181' },
  { col: 'NAME', label: 'Full name', required: true, kind: 'text', placeholder: 'As on the admission form', format: 'As on the admission form', example: 'Ananya Kulkarni' },
  { col: 'DOB', label: 'Date of birth', required: true, kind: 'date', format: 'YYYY-MM-DD', example: '2008-05-14' },
  { col: 'GENDER', label: 'Gender', required: true, kind: 'select', format: 'M, F or T', example: 'F',
    options: [{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'T', label: 'Transgender' }] },
  { col: 'CATEGORY', label: 'Category', required: true, kind: 'select', format: 'GEN, EWS, OBC-NCL, SC or ST', example: 'GEN',
    options: ['GEN', 'EWS', 'OBC-NCL', 'SC', 'ST'].map((v) => ({ value: v, label: v })) },
  { col: 'PROGRAMME', label: 'Programme', required: true, kind: 'select', format: PROGRAMMES.map((p) => p.label).join(', '), example: 'B.Tech CSE',
    options: PROGRAMMES.map((p) => ({ value: p.label, label: p.name })) },
  { col: 'QUOTA', label: 'Seat quota', required: true, kind: 'select', format: 'REGULAR, NRI, NRI-CONVERTED, FN-OCI-CIWG, TFW or PM-USPY', example: 'REGULAR',
    options: [
      { value: 'REGULAR', label: 'Regular' }, { value: 'NRI', label: 'NRI' }, { value: 'NRI-CONVERTED', label: 'NRI seat filled by general merit' },
      { value: 'FN-OCI-CIWG', label: 'FN / OCI / CIWG (supernumerary)' }, { value: 'TFW', label: 'Tuition Fee Waiver (supernumerary)' }, { value: 'PM-USPY', label: 'PM-USPY (supernumerary)' },
    ] },
  { col: 'NRI', label: 'NRI', required: true, kind: 'select', options: yn, format: 'Y or N', example: 'N' },
  { col: 'OCI', label: 'OCI status', required: true, kind: 'select', options: yn, format: 'Y or N', example: 'N' },
  { col: 'OCI_CARD_NO', label: 'OCI card number', required: false, kind: 'text', placeholder: 'A1234567', format: 'Required when OCI status is Y', example: '' },
  { col: 'FN', label: 'Foreign national', required: true, kind: 'select', options: yn, format: 'Y or N', example: 'N' },
  { col: 'NATIONALITY', label: 'Nationality', required: true, kind: 'text', placeholder: 'Indian', format: 'Country name', example: 'Indian' },
  { col: 'ADMISSION_DATE', label: 'Admission date', required: true, kind: 'date', format: 'YYYY-MM-DD', example: '2026-08-19' },
]

export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.col, f])) as Record<Column, FieldDef>

export function blankRow(rowNo: number): UploadRow {
  return {
    rowNo, APAAR_ID: '', APAAR_EXCEPTION: '', INST_STUDENT_ID: '', NAME: '', DOB: '', GENDER: '', CATEGORY: 'GEN',
    PROGRAMME: PROGRAMMES[0].label, QUOTA: 'REGULAR', NRI: 'N', OCI: 'N', OCI_CARD_NO: '', FN: 'N', NATIONALITY: 'Indian',
    ADMISSION_DATE: new Date().toISOString().slice(0, 10),
  }
}

export function checkField(col: Column, row: UploadRow): string | undefined {
  const v = row[col].trim()
  switch (col) {
    case 'APAAR_ID':
      if (!v && !row.APAAR_EXCEPTION) return 'Enter the 12-digit APAAR ID, or choose an APAAR exception.'
      if (v && !/^\d{12}$/.test(v.replace(/\s/g, ''))) return 'Enter 12 digits, for example 4471 2093 6618.'
      return undefined
    case 'OCI_CARD_NO':
      return row.OCI === 'Y' && !v ? 'Enter the OCI card number, or set OCI status to No.' : undefined
    case 'INST_STUDENT_ID': return v ? undefined : 'Enter the institution student ID.'
    case 'NAME': return v ? undefined : 'Enter the student’s full name.'
    case 'DOB': return v ? undefined : 'Enter the date of birth.'
    case 'GENDER': return v ? undefined : 'Choose a gender.'
    case 'NATIONALITY': return v ? undefined : 'Enter the nationality.'
    case 'ADMISSION_DATE': return v ? undefined : 'Enter the admission date.'
    default: return undefined
  }
}

export function checkRow(row: UploadRow): Partial<Record<Column, string>> {
  const out: Partial<Record<Column, string>> = {}
  for (const f of FIELDS) {
    const e = checkField(f.col, row)
    if (e) out[f.col] = e
  }
  return out
}
