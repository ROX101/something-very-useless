import * as XLSX from 'xlsx'
import { COLUMNS, OPTIONAL_COLUMNS, type Column, type UploadRow, type ValidationResult } from './engine/types'
import { RULE_INFO } from './engine/rules'
import { FIELDS } from './fields'

export interface ParsedFile {
  sheetName: string
  headers: string[]
  found: Column[]
  missing: Column[]
  extra: string[]
  rows: UploadRow[]
}

export function parseWorkbook(data: ArrayBuffer): ParsedFile {
  const wb = XLSX.read(data, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
  const headers = (aoa[0] ?? []).map((h) => String(h).trim())
  const index = new Map(headers.map((h, i) => [h.toUpperCase().replace(/\s+/g, '_'), i]))
  const found = COLUMNS.filter((c) => index.has(c))
  const missing = COLUMNS.filter((c) => !index.has(c) && !OPTIONAL_COLUMNS.includes(c))
  const known = new Set<string>(COLUMNS)
  const extra = headers.filter((h) => h && !known.has(h.toUpperCase().replace(/\s+/g, '_')))
  const rows: UploadRow[] = []
  aoa.slice(1).forEach((line, i) => {
    if (!line.some((v) => String(v).trim() !== '')) return
    const row = { rowNo: i + 2 } as UploadRow
    for (const c of COLUMNS) {
      const at = index.get(c)
      row[c] = at === undefined ? '' : String(line[at] ?? '').trim()
    }
    rows.push(row)
  })
  return { sheetName, headers, found, missing, extra, rows }
}

function sheetFrom(rows: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = rows[0].map((h) => ({ wch: Math.max(12, String(h).length + 2) }))
  return ws
}

export function workbookFromRows(rows: UploadRow[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const aoa: string[][] = [[...COLUMNS], ...rows.map((r) => COLUMNS.map((c) => r[c]))]
  XLSX.utils.book_append_sheet(wb, sheetFrom(aoa), 'Admissions')
  return wb
}

export function downloadTemplate() {
  const wb = workbookFromRows([])
  const guide = [
    ['Column', 'Field', 'Required', 'Format or allowed values', 'Example'],
    ...COLUMNS.map((c) => {
      const f = FIELDS.find((x) => x.col === c)!
      return [c, f.label, f.required ? 'Yes' : c === 'APAAR_ID' ? 'Yes, unless an APAAR exception is given' : 'No', f.format, f.example]
    }),
    [],
    ['Rules'],
    ['Keep the column names and their order exactly as in the Admissions sheet. Do not add, rename or remove columns.'],
    ['One row per student. Dates as YYYY-MM-DD. Codes in capital letters as listed above.'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(guide)
  ws['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 38 }, { wch: 70 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Field guide')
  XLSX.writeFile(wb, 'APAAR_Enrolment_Template_AY2026-27.xlsx')
}

export function downloadRows(rows: UploadRow[], name: string) {
  XLSX.writeFile(workbookFromRows(rows), `${name.replace(/\.xlsx$/i, '').replace(/[^A-Za-z0-9_-]+/g, '_')}.xlsx`)
}

export function downloadErrorReport(result: ValidationResult, fileName: string) {
  const wb = XLSX.utils.book_new()
  const header = ['ROW', 'STATUS', 'RULE', 'ISSUE', 'FIELD', 'SUGGESTED_FIX', ...COLUMNS]
  const lines: string[][] = [header]
  for (const r of result.rows) {
    for (const f of r.flags) {
      if (f.kind === 'auto') continue
      lines.push([
        String(r.row.rowNo),
        f.kind === 'alert' ? 'Compliance alert' : 'Data error',
        `${f.rule} ${RULE_INFO[f.rule].title}`,
        f.message,
        f.field ?? '',
        f.fix?.label ?? '',
        ...COLUMNS.map((c) => r.row[c]),
      ])
    }
  }
  XLSX.utils.book_append_sheet(wb, sheetFrom(lines), 'Issues')
  XLSX.writeFile(wb, fileName.replace(/\.xlsx$/i, '') + '_issues.xlsx')
}
