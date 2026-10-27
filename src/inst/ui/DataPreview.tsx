import { useMemo, useState, type ReactNode } from 'react'
import { COLUMNS, type Column, type RowResult, type UploadRow } from '../engine/types'
import { FIELD } from '../fields'
import { btn } from './bits'
import type { RowChange } from '../store'

type Status = 'clean' | 'action' | 'auto'
const STATUS_LABEL: Record<Status, string> = { clean: 'Clean', action: 'Needs action', auto: 'Auto-cleared' }
const STATUS_TONE: Record<Status, string> = { clean: 'text-ok', action: 'text-err', auto: 'text-muted' }
const CHANGE_LABEL: Record<RowChange, string> = { fixed: 'Fixed', edited: 'Edited', added: 'Added' }
/** Whole-row highlight for rows changed since upload; the sticky cells need it too or they show white. */
const CHANGE_BG: Record<RowChange, string> = { fixed: 'bg-[#E3F4E8]', edited: 'bg-[#FFF1D6]', added: 'bg-[#E8F0FB]' }
const CHANGE_BAR: Record<RowChange, string> = { fixed: 'shadow-[inset_4px_0_0_#1D6F42]', edited: 'shadow-[inset_4px_0_0_#E07B1A]', added: 'shadow-[inset_4px_0_0_#2F6FB2]' }

export function DataPreview({ rows, results, title, actions, onEdit, onRemove, onRemoveMany, changes, emptyText }: {
  rows: UploadRow[]
  results?: RowResult[]
  title: ReactNode
  actions?: ReactNode
  onEdit?: (rowNo: number) => void
  onRemove?: (rowNo: number) => void
  /** Turns on row selection with a "Remove selected" button. */
  onRemoveMany?: (rowNos: number[]) => void
  /** Rows changed since upload, highlighted across the whole row. */
  changes?: Record<number, RowChange>
  emptyText?: string
}) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | Status | 'changed'>('all')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const changeOf = (n: number) => changes?.[n]
  const changedCount = changes ? rows.filter((r) => changes[r.rowNo]).length : 0

  const byRow = useMemo(() => new Map((results ?? []).map((r) => [r.row.rowNo, r])), [results])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      const st = byRow.get(r.rowNo)?.status
      if (status === 'changed') { if (!changeOf(r.rowNo)) return false } else if (status !== 'all' && st !== status) return false
      if (!needle) return true
      return `${r.rowNo} ${r.APAAR_ID} ${r.INST_STUDENT_ID} ${r.NAME} ${r.PROGRAMME} ${r.QUOTA}`.toLowerCase().includes(needle)
    })
  }, [rows, q, status, byRow, changes])

  // Selection only keeps rows that still exist.
  const live = useMemo(() => new Set(rows.map((r) => r.rowNo)), [rows])
  const picked = [...selected].filter((n) => live.has(n))
  const allShown = shown.length > 0 && shown.every((r) => selected.has(r.rowNo))
  const toggle = (n: number) => { setConfirming(false); setSelected((cur) => { const s = new Set(cur); if (s.has(n)) s.delete(n); else s.add(n); return s }) }
  const toggleShown = () => {
    setConfirming(false)
    setSelected((cur) => { const s = new Set(cur); for (const r of shown) { if (allShown) s.delete(r.rowNo); else s.add(r.rowNo) } return s })
  }
  const remove = () => { onRemoveMany?.(picked); setSelected(new Set()); setConfirming(false) }

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
            {changedCount > 0 && (
              <button type="button" aria-pressed={status === 'changed'} onClick={() => setStatus('changed')}
                className={`h-11 rounded border px-3 text-sm font-semibold ${status === 'changed' ? 'border-navy bg-navy text-white' : 'border-ok bg-[#E3F4E8] text-ink hover:bg-ok-bg'}`}>
                Updated {changedCount}
              </button>
            )}
          </div>
        )}
      </div>

      {onRemoveMany && picked.length > 0 && (
        <div role="region" aria-label="Selected rows" className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-err-bg px-5 py-3">
          <p className="text-sm text-ink"><strong>{picked.length}</strong> row{picked.length === 1 ? '' : 's'} selected</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.secondary} onClick={() => { setSelected(new Set()); setConfirming(false) }}>Clear selection</button>
            {confirming ? (
              <button type="button" className="inline-flex items-center justify-center gap-2 rounded bg-err px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90" onClick={remove}>
                Confirm: remove {picked.length} student{picked.length === 1 ? '' : 's'}
              </button>
            ) : (
              <button type="button" className="inline-flex items-center justify-center gap-2 rounded border border-err bg-white px-4 py-2.5 text-sm font-semibold text-err hover:bg-err-bg" onClick={() => setConfirming(true)}>
                Remove selected
              </button>
            )}
          </div>
        </div>
      )}

      {changedCount > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line px-5 py-2 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-l-4 border-ok bg-[#E3F4E8]" />Fixed by a suggested fix</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-l-4 border-saffron bg-[#FFF1D6]" />Edited by hand</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-l-4 border-[#2F6FB2] bg-[#E8F0FB]" />Added after upload</span>
        </div>
      )}

      <div className="max-h-[70vh] overflow-auto">
        <table className="w-max min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-page shadow-[inset_0_-1px_0_#D9D9D9]">
            <tr>
              <th className="sticky left-0 z-20 w-16 min-w-[4rem] bg-page px-3 py-2.5 text-left font-semibold text-muted">
                {onRemoveMany ? (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-navy" checked={allShown} onChange={toggleShown}
                      aria-label={allShown ? 'Clear selection of shown rows' : 'Select all shown rows'} />
                    Row
                  </label>
                ) : 'Row'}
              </th>
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
              const ch = changeOf(r.rowNo)
              const isPicked = selected.has(r.rowNo)
              const rowBg = isPicked ? 'bg-err-bg' : ch ? CHANGE_BG[ch] : 'bg-white'
              return (
                <tr key={r.rowNo} className={`${rowBg} ${ch || isPicked ? '' : 'hover:bg-page/60'}`}>
                  <td className={`sticky left-0 z-10 w-16 min-w-[4rem] px-3 py-2 text-muted tnum ${rowBg} ${ch ? CHANGE_BAR[ch] : ''}`}>
                    {onRemoveMany ? (
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 accent-navy" checked={isPicked} onChange={() => toggle(r.rowNo)} aria-label={`Select row ${r.rowNo}, ${r.NAME}`} />
                        {r.rowNo}
                      </label>
                    ) : r.rowNo}
                  </td>
                  <td className={`sticky left-16 z-10 min-w-[14rem] whitespace-nowrap px-3 py-2 font-medium shadow-[inset_-1px_0_0_#D9D9D9] ${bad.has('NAME') ? 'bg-err-bg text-err' : `${rowBg} text-ink`}`}>
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
                      {ch && <span className="mr-2 rounded bg-white/80 px-1.5 py-0.5 text-xs font-semibold text-ink ring-1 ring-line">{CHANGE_LABEL[ch]}</span>}
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
