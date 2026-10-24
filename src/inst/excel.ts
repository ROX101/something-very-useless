import * as XLSX from 'xlsx'
import { COLUMNS, OPTIONAL_COLUMNS, type Column, type UploadRow, type ValidationResult } from './engine/types'
import { RULE_INFO } from './engine/rules'

export interface ParsedFile {
  sheetName: string
  headers: string[]
  found: Column[]
  missing: Column[]
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
  return { sheetName, headers, found, missing, rows }
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
  XLSX.writeFile(workbookFromRows([]), 'APAAR-Sathi_Enrolment_Template.xlsx')
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
