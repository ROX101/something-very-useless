import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Column, UploadRow } from '../engine/types'
import { FIELD, checkField, checkRow, type FieldDef } from '../fields'
import { btn } from './bits'

const control = 'mt-1 h-11 w-full rounded border bg-white px-3 text-[0.9375rem] text-ink focus:outline-none focus:ring-2 focus:ring-navy/30 disabled:bg-page disabled:text-muted'

const GROUPS: { title: string; cols: Column[] }[] = [
  { title: 'Student', cols: ['INST_STUDENT_ID', 'NAME', 'DOB', 'GENDER', 'CATEGORY'] },
  { title: 'APAAR', cols: ['APAAR_ID', 'APAAR_EXCEPTION'] },
  { title: 'Admission', cols: ['PROGRAMME', 'QUOTA', 'ADMISSION_DATE'] },
  { title: 'Residency and nationality', cols: ['NATIONALITY', 'NRI', 'OCI', 'OCI_CARD_NO', 'FN'] },
]

function Field({ f, row, error, onChange, onBlur, disabled, autoFocus }: {
  f: FieldDef; row: UploadRow; error?: string; disabled?: boolean; autoFocus?: boolean
  onChange: (v: string) => void; onBlur: () => void
}) {
  const id = `f-${f.col}`
  const cls = `${control} ${error ? 'border-err' : 'border-line'}`
  const common = { id, disabled, autoFocus, onBlur, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-err` : undefined }
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {f.label}{f.required && <span aria-hidden> *</span>}
      </label>
      {f.kind === 'select' ? (
        <select {...common} value={row[f.col]} onChange={(e) => onChange(e.target.value)} className={cls}>
          {f.col === 'GENDER' && <option value="">Choose</option>}
          {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input {...common} type={f.kind === 'date' ? 'date' : 'text'} value={row[f.col]} placeholder={f.placeholder}
          inputMode={f.col === 'APAAR_ID' ? 'numeric' : undefined} onChange={(e) => onChange(e.target.value)}
          className={`${cls} ${f.col === 'APAAR_ID' || f.col === 'INST_STUDENT_ID' ? 'font-mono' : ''}`} />
      )}
      {error && <p id={`${id}-err`} className="mt-1 text-sm text-err">{error}</p>}
    </div>
  )
}

export function StudentForm({ initial, submitLabel, onSubmit, onCancel, resetAfterSubmit, compact }: {
  initial: UploadRow; submitLabel: string; onSubmit: (row: UploadRow) => void; onCancel?: () => void; resetAfterSubmit?: (row: UploadRow) => UploadRow; compact?: boolean
}) {
  const [row, setRow] = useState<UploadRow>(initial)
  const [errors, setErrors] = useState<Partial<Record<Column, string>>>({})
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => { setRow(initial); setErrors({}) }, [initial])

  const change = (col: Column, v: string) => {
    setRow((r) => {
      const next = { ...r, [col]: v }
      if (col === 'OCI' && v === 'N') next.OCI_CARD_NO = ''
      if (col === 'APAAR_EXCEPTION' && v) next.APAAR_ID = ''
      return next
    })
    setErrors((e) => (e[col] || (col === 'APAAR_EXCEPTION' && e.APAAR_ID) || (col === 'OCI' && e.OCI_CARD_NO)
      ? { ...e, [col]: undefined, ...(col === 'APAAR_EXCEPTION' ? { APAAR_ID: undefined } : {}), ...(col === 'OCI' ? { OCI_CARD_NO: undefined } : {}) }
      : e))
  }
  const blur = (col: Column) => setErrors((e) => ({ ...e, [col]: checkField(col, row) }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const errs = checkRow(row)
    setErrors(errs)
    const first = Object.keys(errs)[0]
    if (first) { formRef.current?.querySelector<HTMLElement>(`#f-${first}`)?.focus(); return }
    const clean = { ...row, APAAR_ID: row.APAAR_ID.replace(/\s/g, ''), NAME: row.NAME.trim(), INST_STUDENT_ID: row.INST_STUDENT_ID.trim().toUpperCase(), NATIONALITY: row.NATIONALITY.trim() }
    onSubmit(clean)
    if (resetAfterSubmit) { setRow(resetAfterSubmit(clean)); setErrors({}) }
  }

  return (
    <form ref={formRef} noValidate onSubmit={submit}>
      <div className="space-y-6">
        {GROUPS.map((g, gi) => (
          <fieldset key={g.title} className="min-w-0">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</legend>
            <div className={`grid gap-4 sm:grid-cols-2 ${compact ? '' : 'lg:grid-cols-3 2xl:grid-cols-5'}`}>
              {g.cols.map((c, i) => (
                <Field key={c} f={FIELD[c]} row={row} error={errors[c]} autoFocus={gi === 0 && i === 0}
                  disabled={(c === 'OCI_CARD_NO' && row.OCI !== 'Y') || (c === 'APAAR_ID' && Boolean(row.APAAR_EXCEPTION))}
                  onChange={(v) => change(c, v)} onBlur={() => blur(c)} />
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5">
        <button type="submit" className={btn.primary}>{submitLabel}</button>
        {onCancel && <button type="button" className={btn.secondary} onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

export function StudentDrawer({ title, sub, initial, submitLabel, onSubmit, onClose }: {
  title: string; sub: string; initial: UploadRow; submitLabel: string; onSubmit: (row: UploadRow) => void; onClose: () => void
}) {
  const opener = useRef<Element | null>(null)
  useEffect(() => {
    opener.current = document.activeElement
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => { window.removeEventListener('keydown', k); (opener.current as HTMLElement | null)?.focus?.() }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-neutral-900/30" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="relative flex h-full w-full max-w-2xl animate-[slideIn_.2s_ease-out] flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <p className="text-sm text-muted">{sub}</p>
            <h2 className="text-xl font-semibold text-ink">{title}</h2>
          </div>
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded text-2xl leading-none text-muted hover:text-ink" aria-label="Close">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <StudentForm compact initial={initial} submitLabel={submitLabel} onSubmit={onSubmit} onCancel={onClose} />
        </div>
      </div>
    </div>
  )
}
