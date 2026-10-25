import { useMemo, useState, type ReactNode } from 'react'
import { COLUMNS, type Column, type RowResult, type UploadRow } from '../engine/types'
import { FIELD } from '../fields'
import { btn } from './bits'

type Status = 'clean' | 'action' | 'auto'
const STATUS_LABEL: Record<Status, string> = { clean: 'Clean', action: 'Needs action', auto: 'Auto-cleared' }
const STATUS_TONE: Record<Status, string> = { clean: 'text-ok', action: 'text-err', auto: 'text-muted' }

export function DataPreview({ rows, results, title, actions, onEdit, onRemove, emptyText }: {
  rows: UploadRow[]
  results?: RowResult[]
  title: ReactNode
  actions?: ReactNode
  onEdit?: (rowNo: number) => void
  onRemove?: (rowNo: number) => void
  emptyText?: string
}) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | Status>('all')

  const byRow = useMemo(() => new Map((results ?? []).map((r) => [r.row.rowNo, r])), [results])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      const st = byRow.get(r.rowNo)?.status
      if (status !== 'all' && st !== status) return false
      if (!needle) return true
      return `${r.rowNo} ${r.APAAR_ID} ${r.INST_STUDENT_ID} ${r.NAME} ${r.PROGRAMME} ${r.QUOTA}`.toLowerCase().includes(needle)
    })
  }, [rows, q, status, byRow])

  const view = shown
  const count = (s: Status) => (results ?? []).filter((r) => r.status === s).length

  return (
    <section className="rounded border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-3">
        <label className="min-w-[16rem] flex-1 text-sm text-muted">Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, student ID, APAAR ID or row"
            className="mt-1 h-11 w-full rounded border border-line bg-white px-3 text-[0.9375rem] text-ink focus:outline-none focus:ring-2 focus:ring-navy/30" />
        </label>
        {results && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
            {(['all', 'action', 'auto', 'clean'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
                className={`h-11 rounded border px-3 text-sm font-semibold ${status === s ? 'border-navy bg-navy text-white' : 'border-line bg-white text-ink hover:bg-page'}`}>
                {s === 'all' ? `All ${rows.length}` : `${STATUS_LABEL[s]} ${count(s)}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="max-h-[70vh] overflow-auto">
        <table className="w-max min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-page shadow-[inset_0_-1px_0_#D9D9D9]">
            <tr>
              <th className="sticky left-0 z-20 w-16 min-w-[4rem] bg-page px-3 py-2.5 text-left font-semibold text-muted">Row</th>
              <th className="sticky left-16 z-20 min-w-[14rem] bg-page px-3 py-2.5 text-left font-semibold text-muted shadow-[inset_-1px_0_0_#D9D9D9]">
                {FIELD.NAME.label}<span className="block font-mono text-[0.75rem] font-normal">NAME</span>
              </th>
              {(onEdit || onRemove) && <th className="px-3 py-2.5 text-left font-semibold text-muted">Actions</th>}
              {results && <th className="px-3 py-2.5 text-left font-semibold text-muted">Status</th>}
              {COLUMNS.filter((c) => c !== 'NAME').map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-muted">
                  {FIELD[c].label}<span className="block font-mono text-[0.75rem] font-normal">{c}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {view.map((r) => {
              const res = byRow.get(r.rowNo)
              const bad = new Set(res?.flags.filter((f) => f.kind !== 'auto').map((f) => f.field).filter(Boolean) as Column[])
              return (
                <tr key={r.rowNo} className="hover:bg-page/60">
                  <td className="sticky left-0 z-10 w-16 min-w-[4rem] bg-white px-3 py-2 text-muted tnum">{r.rowNo}</td>
                  <td className={`sticky left-16 z-10 min-w-[14rem] whitespace-nowrap px-3 py-2 font-medium shadow-[inset_-1px_0_0_#D9D9D9] ${bad.has('NAME') ? 'bg-err-bg text-err' : 'bg-white text-ink'}`}>
                    {r.NAME || <span className="text-muted">–</span>}
                  </td>
                  {(onEdit || onRemove) && (
                    <td className="whitespace-nowrap px-1 py-1">
                      {onEdit && <button className={btn.ghost} onClick={() => onEdit(r.rowNo)}>Edit</button>}
                      {onRemove && <button className={`${btn.ghost} text-err`} onClick={() => onRemove(r.rowNo)}>Remove</button>}
                    </td>
                  )}
                  {results && (
                    <td className={`whitespace-nowrap px-3 py-2 font-semibold ${res ? STATUS_TONE[res.status] : 'text-muted'}`}>
                      {res ? STATUS_LABEL[res.status] : ''}
                      {res && res.flags.length > 0 && <span className="ml-1 font-normal text-muted">{res.flags.map((f) => f.rule).join(', ')}</span>}
                    </td>
                  )}
                  {COLUMNS.filter((c) => c !== 'NAME').map((c) => (
                    <td key={c} className={`whitespace-nowrap px-3 py-2 ${bad.has(c) ? 'bg-err-bg font-semibold text-err' : 'text-ink'} ${c === 'APAAR_ID' || c === 'INST_STUDENT_ID' ? 'font-mono' : ''}`}>
                      {r[c] || <span className="text-muted">–</span>}
                    </td>
                  ))}
                </tr>
              )
            })}
            {!view.length && (
              <tr><td colSpan={COLUMNS.length + 3} className="px-5 py-10 text-center text-muted">{rows.length ? 'No rows match the search.' : emptyText ?? 'No rows yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line px-5 py-3 text-sm text-muted">
        {shown.length === rows.length
          ? `${rows.length.toLocaleString('en-IN')} rows, ${COLUMNS.length} columns`
          : `${shown.length.toLocaleString('en-IN')} of ${rows.length.toLocaleString('en-IN')} rows, ${COLUMNS.length} columns`}
      </div>
    </section>
  )
}
