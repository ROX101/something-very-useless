import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { InstLayout } from '../ui/InstLayout'
import { Card, ClauseChip, CountUp, LockIcon, PageHeader, RuleChip, btn, formatApaar, formatDate, maskApaar } from '../ui/bits'
import { useInst, useValidation } from '../store'
import { parseWorkbook, downloadErrorReport, downloadRows, downloadTemplate, type ParsedFile } from '../excel'
import { blankRow } from '../fields'
import { audit } from '../../audit/log'
import { DataPreview } from '../ui/DataPreview'
import { ApiAccess } from '../ui/ApiAccess'
import { StudentDrawer, StudentForm } from '../ui/StudentForm'
import { GATES, RULE_INFO, applyAllFixes, applyFix, runRules } from '../engine/rules'
import { PREVIEW_CONTEXT } from '../data/dataset'
import { INSTITUTION } from '../data/reference'
import { COLUMNS, type Flag, type RowResult, type RuleCode, type UploadRow, type ValidationResult } from '../engine/types'

type Phase = 'select' | 'mapped' | 'validating' | 'results'

export default function Upload() {
  const { rows, fileName, uploadedAt, fixesApplied, setUpload, setRows, clearUpload, saveRow, setDraft } = useInst()
  const result = useValidation()
  const [phase, setPhase] = useState<Phase>(rows ? 'results' : 'select')
  const [parsed, setParsed] = useState<{ file: string; data: ParsedFile } | null>(null)
  const [error, setError] = useState<{ text: string; missing?: string[]; extra?: string[] } | null>(null)
  const [pending, setPending] = useState<ValidationResult | null>(null)

  async function onFile(file: File) {
    setError(null)
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError({ text: `${file.name} is not an Excel or CSV file. Save it as .xlsx from the enrolment template and upload again.` }); return }
    try {
      const data = parseWorkbook(await file.arrayBuffer())
      if (data.missing.length) {
        setError({ text: `${file.name} does not follow the enrolment template, so it was not loaded. Copy the data into the template and upload again.`, missing: data.missing, extra: data.extra })
        return
      }
      if (!data.rows.length) { setError({ text: `${file.name} has the right columns but no student rows. Add one row per student and upload again.` }); return }
      setParsed({ file: file.name, data })
      setPhase('mapped')
    } catch {
      setError({ text: `${file.name} could not be opened. Save it again as .xlsx from the enrolment template and upload again.` })
    }
  }

  function startValidation() {
    if (!parsed) return
    setPending(runRules(parsed.data.rows, PREVIEW_CONTEXT))
    setUpload(parsed.file, parsed.data.rows)
    setPhase('validating')
  }

  function validateManual(list: UploadRow[]) {
    const name = `Manual entry, ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    setPending(runRules(list, PREVIEW_CONTEXT))
    setUpload(name, list)
    setDraft([])
    setPhase('validating')
  }

  function reset() {
    clearUpload()
    setParsed(null)
    setPhase('select')
  }

  return (
    <InstLayout>
      {phase === 'select' && <SelectFile onFile={onFile} error={error} onManual={validateManual} />}
      {phase === 'mapped' && parsed && (
        <Mapping parsed={parsed} onBack={() => { setParsed(null); setPhase('select') }} onValidate={startValidation}
          onAdd={(row) => {
            audit('Data', 'Added student to file before validation', `${parsed.file}, row ${row.rowNo}, ${row.INST_STUDENT_ID}, ${row.NAME}`)
            setParsed((p) => (p ? { ...p, data: { ...p.data, rows: [...p.data.rows, row] } } : p))
          }} />
      )}
      {phase === 'validating' && pending && <Validating result={pending} onDone={() => setPhase('results')} />}
      {phase === 'results' && result && rows && (
        <Results
          result={result}
          fileName={fileName ?? ''}
          uploadedAt={uploadedAt}
          fixesApplied={fixesApplied}
          onReset={reset}
          onApplyAll={() => setRows(applyAllFixes(rows, result), result.fixable)}
          onApplyOne={(rowNo, f) => f.fix && setRows(applyFix(rows, rowNo, f.fix), 1)}
          rows={rows}
          onSaveRow={saveRow}
        />
      )}
    </InstLayout>
  )
}

function SelectFile({ onFile, error, onManual }: { onFile: (f: File) => void; error: { text: string; missing?: string[]; extra?: string[] } | null; onManual: (rows: UploadRow[]) => void }) {
  const [tab, setTab] = useState<'excel' | 'manual' | 'api'>('excel')
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }
  const tabs = { excel: 'Upload Excel file', manual: 'Enter student by student', api: 'ERP via API' } as const
  return (
    <>
      <PageHeader title="Upload & validate" sub={`First-year admissions, AY ${INSTITUTION.ay}`} />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {(Object.keys(tabs) as (keyof typeof tabs)[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`-mb-px min-h-11 border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t ? 'border-navy text-navy' : 'border-transparent text-muted hover:text-ink'}`}>
            {tabs[t]}
          </button>
        ))}
      </div>

      {tab === 'excel' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="p-6">
            <div
              onDragOver={(e) => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
              onClick={() => input.current?.click()}
              role="button" tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-6 py-16 text-center ${over ? 'border-navy bg-navy-light' : 'border-line hover:border-navy/60 hover:bg-page'}`}>
              <svg className="h-12 w-12 text-navy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13l2 2 4-4" />
              </svg>
              <p className="mt-4 text-lg font-semibold text-ink">Drop the filled enrolment template here</p>
              <p className="mt-1 text-sm text-muted">or <span className="font-semibold text-navy underline">browse</span>, .xlsx or .csv, one row per student</p>
              <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
            </div>
            {error && (
              <div role="alert" className="mt-4 border-l-4 border-err bg-err-bg px-4 py-3 text-sm text-ink">
                <p className="font-semibold text-err">{error.text}</p>
                {error.missing && error.missing.length > 0 && <p className="mt-2">Missing columns: <span className="font-mono">{error.missing.join(', ')}</span></p>}
                {error.extra && error.extra.length > 0 && <p className="mt-1">Columns not in the template: <span className="font-mono">{error.extra.join(', ')}</span></p>}
                {error.missing && <button type="button" onClick={downloadTemplate} className={`${btn.secondary} mt-3`}>Download template</button>}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-semibold text-ink">Enrolment template</h2>
            <p className="mt-1 text-sm text-muted">Every file must use this template. Column names and order are fixed.</p>
            <ol className="mt-4 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {COLUMNS.map((c, i) => (
                <li key={c} className="flex gap-2"><span className="w-5 text-right text-muted tnum">{i + 1}</span><span className="font-mono text-ink">{c}</span></li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={downloadTemplate} className={btn.primary}>Download template</button>
              <a href="/Aranya_AY2026-27_FirstYear.xlsx" download className={btn.secondary}>Download sample file</a>
            </div>
            <p className="mt-3 text-sm text-muted">The template includes a Field guide sheet with the allowed values for each column.</p>
          </Card>
        </div>
      )}

      {tab === 'manual' && <ManualEntry onValidate={onManual} />}

      {tab === 'api' && <ApiAccess pid={INSTITUTION.pid} ay={INSTITUTION.ay} />}
    </>
  )
}

function ManualEntry({ onValidate }: { onValidate: (rows: UploadRow[]) => void }) {
  const { draft, setDraft } = useInst()
  const [editing, setEditing] = useState<number | null>(null)
  const [last, setLast] = useState('')
  const [carry, setCarry] = useState<Partial<UploadRow>>({})
  const nextNo = draft.length + 2
  const initial = useMemo(() => ({ ...blankRow(nextNo), ...carry }), [nextNo, carry])
  const renumber = (list: UploadRow[]) => list.map((r, i) => ({ ...r, rowNo: i + 2 }))
  const editRow = editing !== null ? draft.find((r) => r.rowNo === editing) ?? null : null

  return (
    <>
      <Card className="p-6">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">Add a student</h2>
          <span className="text-sm text-muted">Row {nextNo} of the enrolment sheet</span>
        </div>
        <StudentForm initial={initial} submitLabel="Add student"
          onSubmit={(row) => {
            setCarry({ PROGRAMME: row.PROGRAMME, QUOTA: row.QUOTA, ADMISSION_DATE: row.ADMISSION_DATE })
            setDraft([...draft, { ...row, rowNo: nextNo }], { action: 'Entered student manually', detail: `Row ${nextNo}, ${row.INST_STUDENT_ID}, ${row.NAME}` })
            setLast(`Added row ${nextNo}, ${row.NAME}.`)
          }} />
        {last && <p role="status" className="mt-4 border-l-4 border-ok bg-ok-bg px-4 py-2 text-sm text-ink">{last}</p>}
      </Card>

      <div className="mt-6">
        <DataPreview rows={draft} title={`Entered so far (${draft.length})`} emptyText="Students you add appear here, one row each, in the same columns as the Excel template."
          onEdit={setEditing}
          onRemove={(n) => { const row = draft.find((r) => r.rowNo === n); setDraft(renumber(draft.filter((r) => r.rowNo !== n)), { action: 'Removed manual entry', detail: `Row ${n}, ${row?.NAME ?? ''}` }) }}
          actions={draft.length > 0 && <>
            <button className={btn.secondary} onClick={() => downloadRows(draft, 'Manual_entries_AY2026-27')}>Download as Excel</button>
            <button className={btn.primary} onClick={() => onValidate(draft)}>Validate {draft.length} student{draft.length === 1 ? '' : 's'}</button>
          </>} />
      </div>

      {editRow && (
        <StudentDrawer title={editRow.NAME || `Row ${editRow.rowNo}`} sub={`Edit row ${editRow.rowNo}`} initial={editRow} submitLabel="Save changes"
          onClose={() => setEditing(null)}
          onSubmit={(row) => { setDraft(draft.map((r) => (r.rowNo === editRow.rowNo ? { ...row, rowNo: editRow.rowNo } : r)), { action: 'Edited manual entry', detail: `Row ${editRow.rowNo}, ${row.NAME}` }); setEditing(null) }} />
      )}
    </>
  )
}

function AddStudentPanel({ nextNo, sheet, onAdd }: { nextNo: number; sheet: string; onAdd: (row: UploadRow) => void }) {
  const [carry, setCarry] = useState<Partial<UploadRow>>({})
  const [last, setLast] = useState('')
  const initial = useMemo(() => ({ ...blankRow(nextNo), ...carry }), [nextNo, carry])
  return (
    <Card className="p-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Add a student</h2>
        <span className="text-sm text-muted">Row {nextNo} of {sheet}</span>
      </div>
      <StudentForm initial={initial} submitLabel="Add student"
        onSubmit={(row) => {
          setCarry({ PROGRAMME: row.PROGRAMME, QUOTA: row.QUOTA, ADMISSION_DATE: row.ADMISSION_DATE })
          onAdd({ ...row, rowNo: nextNo })
          setLast(`Added row ${nextNo}, ${row.NAME}.`)
        }} />
      {last && <p role="status" className="mt-4 border-l-4 border-ok bg-ok-bg px-4 py-2 text-sm text-ink">{last}</p>}
    </Card>
  )
}

function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-line" role="tablist">
      {items.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`-mb-px min-h-11 border-b-2 px-4 py-2.5 text-sm font-semibold ${value === k ? 'border-navy text-navy' : 'border-transparent text-muted hover:text-ink'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Mapping({ parsed, onBack, onValidate, onAdd }: { parsed: { file: string; data: ParsedFile }; onBack: () => void; onValidate: () => void; onAdd: (row: UploadRow) => void }) {
  const { data } = parsed
  const [tab, setTab] = useState<'rows' | 'add'>('rows')
  const nextNo = data.rows.reduce((m, r) => Math.max(m, r.rowNo), 1) + 1
  return (
    <>
      <PageHeader title="Preview file" sub={<>{parsed.file}, sheet “{data.sheetName}”, {data.rows.length.toLocaleString('en-IN')} rows</>}
        actions={<>
          <button className={btn.secondary} onClick={onBack}>Choose another file</button>
          <button className={btn.primary} onClick={onValidate}>Validate {data.rows.length.toLocaleString('en-IN')} rows</button>
        </>} />
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-l-4 border-ok bg-white px-5 py-4 text-[0.9375rem]">
        <span className="font-semibold text-ink">Template columns found: {data.found.length} of {COLUMNS.length}</span>
        {COLUMNS.filter((c) => !data.found.includes(c)).length > 0 && (
          <span className="text-muted">Optional column not in file: {COLUMNS.filter((c) => !data.found.includes(c)).join(', ')}</span>
        )}
        {data.extra.length > 0 && <span className="text-muted">Ignored columns: {data.extra.join(', ')}</span>}
      </div>
      <Tabs value={tab} onChange={setTab} items={[['rows', `Rows in file (${data.rows.length.toLocaleString('en-IN')})`], ['add', 'Add a student']]} />
      <div className="mt-6">
        {tab === 'rows'
          ? <DataPreview rows={data.rows} title={`All rows in ${parsed.file}`} />
          : <AddStudentPanel nextNo={nextNo} sheet={parsed.file} onAdd={onAdd} />}
      </div>
    </>
  )
}

const TOTAL_MS = 1900

function Validating({ result, onDone }: { result: ValidationResult; onDone: () => void }) {
  const [t, setT] = useState(0)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const start = performance.now()
    let raf = 0
    let timer = 0
    const tick = (now: number) => {
      const e = now - start
      setT(Math.min(e, TOTAL_MS))
      if (e < TOTAL_MS) raf = requestAnimationFrame(tick)
      else timer = window.setTimeout(() => done.current(), 350)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [])

  const perGate = useMemo(() => {
    const g = GATES.map(() => ({ hit: 0, auto: 0 }))
    for (const r of result.rows) for (const f of r.flags) {
      const i = RULE_INFO[f.rule].gate
      if (f.kind === 'auto') g[i].auto++
      else g[i].hit++
    }
    return g
  }, [result])

  const p = t / TOTAL_MS
  const gateSpan = TOTAL_MS / GATES.length
  const processed = Math.round(result.counts.total * p)

  return (
    <>
      <PageHeader title="Validating" sub={`${result.counts.total.toLocaleString('en-IN')} rows, rule pack APH 2024-27, AY ${INSTITUTION.ay}`} />
      <Card className="p-6 sm:p-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {GATES.map((g, i) => {
            const state = t >= (i + 1) * gateSpan ? 'done' : t >= i * gateSpan ? 'active' : 'idle'
            return (
              <div key={g}
                className={`rounded border-2 p-4 transition-colors duration-200 ${state === 'done' ? 'border-navy bg-navy-light' : state === 'active' ? 'border-saffron bg-saffron/10' : 'border-line bg-white'}`}>
                <p className="text-xs text-muted">Gate {i + 1}</p>
                <p className="mt-1 font-semibold text-ink">{g}</p>
                <p className="mt-3 min-h-[40px] text-sm leading-5">
                  {state === 'done' && (
                    <>
                      {perGate[i].hit > 0 && <span className="font-semibold text-err">{perGate[i].hit} flagged</span>}
                      {perGate[i].hit > 0 && perGate[i].auto > 0 && <br />}
                      {perGate[i].auto > 0 && <span className="font-semibold text-info">{perGate[i].auto} cleared</span>}
                      {perGate[i].hit + perGate[i].auto === 0 && <span className="text-igreen">✓ Passed</span>}
                    </>
                  )}
                </p>
              </div>
            )
          })}
        </div>
        <div className="mt-8">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-ink">{processed.toLocaleString('en-IN')} / {result.counts.total.toLocaleString('en-IN')} rows</span>
            <span className="text-muted tnum">{(t / 1000).toFixed(1)} s</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-page">
            <div className="h-full bg-navy" style={{ width: `${p * 100}%` }} />
          </div>
        </div>
      </Card>
    </>
  )
}

interface Item { rr: RowResult; flag: Flag }

function Results(props: {
  result: ValidationResult
  fileName: string
  uploadedAt: string | null
  fixesApplied: number
  onReset: () => void
  onApplyAll: () => void
  onApplyOne: (rowNo: number, f: Flag) => void
  rows: UploadRow[]
  onSaveRow: (row: UploadRow) => void
}) {
  const { result, fileName, uploadedAt, fixesApplied } = props
  const [drawer, setDrawer] = useState<number | null>(null)
  const [view, setView] = useState<'issues' | 'records' | 'add'>('issues')
  const [editing, setEditing] = useState<UploadRow | null>(null)
  const nextNo = props.rows.reduce((m, r) => Math.max(m, r.rowNo), 1) + 1
  const newRow = useMemo(() => blankRow(nextNo), [nextNo])

  const groups = useMemo(() => {
    const errors = new Map<RuleCode, Item[]>()
    const autos = new Map<RuleCode, Item[]>()
    for (const rr of result.rows) for (const flag of rr.flags) {
      const m = flag.kind === 'error' ? errors : flag.kind === 'auto' ? autos : null
      if (!m) continue
      m.set(flag.rule, [...(m.get(flag.rule) ?? []), { rr, flag }])
    }
    const byCode = (a: [RuleCode, Item[]], b: [RuleCode, Item[]]) => a[0].localeCompare(b[0])
    return { errors: [...errors.entries()].sort(byCode), autos: [...autos.entries()].sort(byCode) }
  }, [result])

  const byRowNo = useMemo(() => new Map(result.rows.map((r) => [r.row.rowNo, r])), [result])
  const open = drawer !== null ? byRowNo.get(drawer) ?? null : null
  const ready = result.dataErrors === 0

  return (
    <>
      <PageHeader
        title="Validation results"
        sub={<>{fileName}{uploadedAt && <>, uploaded {formatDate(uploadedAt)}</>}</>}
        actions={<>
          <button className={btn.secondary} onClick={() => downloadRows(props.rows, fileName || 'Enrolment_data')}>Download data (.xlsx)</button>
          <button className={btn.secondary} onClick={() => downloadErrorReport(result, fileName)}>Download issues (.xlsx)</button>
          <button className={btn.secondary} onClick={props.onReset}>Upload new file</button>
        </>}
      />

      <div className="grid divide-y divide-line rounded border border-line bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat label="Clean" value={result.counts.clean} tone="text-ink" />
        <Stat label="Need action" value={result.counts.action} tone={result.counts.action ? 'text-err' : 'text-ink'} />
        <Stat label="Auto-cleared" value={result.counts.auto} tone="text-ink" />
      </div>

      {ready ? (
        <div className="mt-5 flex flex-col gap-3 border-l-4 border-ok bg-ok-bg px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-ink">
              {result.counts.total.toLocaleString('en-IN')} records ready, {result.alerts.length} compliance alert{result.alerts.length === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-muted">
              {fixesApplied > 0 && <>{fixesApplied} fixes applied. </>}Data errors are resolved. Compliance alerts will be shared with AICTE on submission.
            </p>
          </div>
          <Link to="/inst/ledger" className={btn.primary}>Continue to seat ledger</Link>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3 border-l-4 border-err bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">
            <span className="font-semibold text-ink">{result.dataErrors} data errors</span> to resolve before submission.{' '}
            <span className="font-semibold text-ink">{result.fixable}</span> have a suggested fix
          </p>
          {result.fixable > 0 && (
            <button className={btn.primary} onClick={props.onApplyAll}>Apply {result.fixable} suggested fixes</button>
          )}
        </div>
      )}

      <div className="mt-8">
        <Tabs value={view} onChange={setView} items={[['issues', 'Issues'], ['records', `All records (${result.counts.total.toLocaleString('en-IN')})`], ['add', 'Add a student']]} />
      </div>

      {view === 'add' && (
        <div className="mt-6">
          <AddStudentPanel nextNo={nextNo} sheet={fileName} onAdd={props.onSaveRow} />
        </div>
      )}

      {view === 'records' && (
        <div className="mt-6">
          <DataPreview rows={props.rows} results={result.rows} title={fileName}
            onEdit={(n) => setEditing(props.rows.find((r) => r.rowNo === n) ?? null)}
            actions={<button className={btn.primary} onClick={() => setEditing(newRow)}>Add student</button>} />
        </div>
      )}

      {view === 'issues' && groups.errors.length > 0 && (
        <Section title="Data errors" note="Fix these in the file, or apply the suggested fix.">
          {groups.errors.map(([rule, items]) => (
            <IssueGroup key={rule} rule={rule} kind="error" items={items} onOpen={setDrawer} />
          ))}
        </Section>
      )}

      {view === 'issues' && result.alerts.length > 0 && (
        <Section title="Compliance alerts" note="Cannot be cleared by the institution, shared with AICTE" icon={<LockIcon className="h-4 w-4 text-warn" />}>
          {result.alerts.map((a) => (
            <div key={a.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-1">
                  <RuleChip rule={a.rule} kind="alert" />
                  <div>
                    <p className="font-semibold text-ink">{a.title}</p>
                    <p className="text-sm text-muted">{a.detail}</p>
                  </div>
                </div>
                <ClauseChip clause={a.clause} />
              </div>
              {a.rowNos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">
                  {a.rowNos.map((n) => {
                    const r = byRowNo.get(n)!
                    return (
                      <button key={n} onClick={() => setDrawer(n)}
                        className="rounded border border-line bg-white px-3 py-1.5 text-left text-sm hover:border-warn">
                        <span className="text-muted tnum">Row {n}</span>{' '}
                        <span className="font-medium text-ink">{r.row.NAME}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {view === 'issues' && groups.autos.length > 0 && (
        <Section title="Auto-cleared" note="Checked and accepted. No action needed.">
          {groups.autos.map(([rule, items]) => (
            <IssueGroup key={rule} rule={rule} kind="auto" items={items} onOpen={setDrawer} />
          ))}
        </Section>
      )}

      {editing && (
        <StudentDrawer
          title={editing.NAME || 'New student'}
          sub={props.rows.some((r) => r.rowNo === editing.rowNo) ? `Edit row ${editing.rowNo}` : `New row ${editing.rowNo}`}
          initial={editing} submitLabel={props.rows.some((r) => r.rowNo === editing.rowNo) ? 'Save changes' : 'Add student'}
          onClose={() => setEditing(null)}
          onSubmit={(row) => { props.onSaveRow({ ...row, rowNo: editing.rowNo }); setEditing(null) }} />
      )}

      {open && (
        <RowDrawer rr={open} onClose={() => setDrawer(null)}
          onFix={(f) => { props.onApplyOne(open.row.rowNo, f); if (f.fix?.remove) setDrawer(null) }} />
      )}
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="px-6 py-5">
      <p className="text-[0.9375rem] text-muted">{label}</p>
      <CountUp value={value} className={`mt-1 block text-[2.5rem] font-semibold leading-none tabular-nums ${tone}`} />
    </div>
  )
}

function Section({ title, note, icon, children }: { title: string; note: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="rounded border border-line bg-white">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">{icon}{title}</h2>
          <span className="text-sm text-muted">{note}</span>
        </div>
        <div className="divide-y divide-line">{children}</div>
      </div>
    </section>
  )
}

function IssueGroup({ rule, kind, items, onOpen }: { rule: RuleCode; kind: 'error' | 'auto'; items: Item[]; onOpen: (n: number) => void }) {
  const [open, setOpen] = useState(false)
  const [resolved, setResolved] = useState(false)
  const isNri = rule === 'R05a'
  useEffect(() => {
    if (!open || !isNri) return
    setResolved(false)
    const id = setTimeout(() => setResolved(true), 900)
    return () => clearTimeout(id)
  }, [open, isNri])
  const info = RULE_INFO[rule]
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-page/60">
        <span className="flex items-center gap-1">
          <RuleChip rule={rule} kind={kind} />
          <span className="font-semibold text-ink">{info.title}</span>
          {info.clause && <span className="hidden sm:inline"><ClauseChip clause={info.clause} /></span>}
        </span>
        <span className="flex items-center gap-3">
          <span className="text-sm text-muted tnum">{items.length} row{items.length === 1 ? '' : 's'}</span>
          <span className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-sm">
            <thead className="bg-page/70 text-left text-[0.8125rem] text-muted">
              <tr>
                <th className="px-5 py-2 font-semibold">Row</th>
                <th className="px-3 py-2 font-semibold">Student</th>
                <th className="px-3 py-2 font-semibold">{kind === 'error' ? 'Issue' : 'Outcome'}</th>
                {kind === 'error' && <th className="px-3 py-2 font-semibold">Suggested fix</th>}
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map(({ rr, flag }) => (
                <tr key={rr.row.rowNo} className="align-top">
                  <td className="px-5 py-3 text-muted tnum">{rr.row.rowNo}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-ink">{rr.row.NAME}</p>
                    <p className="text-xs text-muted">{rr.row.INST_STUDENT_ID}, {rr.row.PROGRAMME}</p>
                  </td>
                  <td className="px-3 py-3 text-ink">
                    {isNri ? (
                      <span className={`inline-flex items-center gap-2 rounded px-2 py-1 text-xs font-semibold transition-all duration-500 ${resolved ? 'bg-ok-bg text-igreen' : 'bg-err-bg text-err'}`}>
                        {resolved ? 'Converted NRI seat, valid' : 'NRI quota, Indian resident?'}
                      </span>
                    ) : flag.message}
                    {isNri && resolved && <p className="mt-1 text-xs text-muted">Vacant NRI seats are filled by general merit candidates at the regular fee.</p>}
                  </td>
                  {kind === 'error' && <td className="px-3 py-3 text-muted">{flag.fix?.label ?? 'Correct in source file'}</td>}
                  <td className="px-5 py-3 text-right">
                    <button className={btn.ghost} onClick={() => onOpen(rr.row.rowNo)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RowDrawer({ rr, onClose, onFix }: { rr: RowResult; onClose: () => void; onFix: (f: Flag) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const flaggedFields = new Set(rr.flags.map((f) => f.field).filter(Boolean))
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`Row ${rr.row.rowNo}`}>
      <button className="absolute inset-0 bg-neutral-900/30" onClick={onClose} aria-label="Close" />
      <div className="relative flex h-full w-full max-w-md animate-[slideIn_.25s_ease-out] flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <p className="text-sm text-muted tnum">Row {rr.row.rowNo}</p>
            <h2 className="text-xl font-semibold text-ink">{rr.row.NAME}</h2>
            <p className="text-sm text-muted">{rr.row.INST_STUDENT_ID}, {rr.row.PROGRAMME}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-2xl leading-none text-muted hover:text-ink" aria-label="Close">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {rr.flags.length === 0 && <p className="rounded bg-ok-bg px-4 py-3 text-sm font-semibold text-igreen">✓ This row is clean</p>}
          {rr.flags.map((f, i) => (
            <div key={i} className={`mb-4 rounded border p-4 ${f.kind === 'error' ? 'border-err/30 bg-err-bg' : f.kind === 'alert' ? 'border-warn-line bg-warn-bg' : 'border-info/30 bg-info-bg'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <RuleChip rule={f.rule} kind={f.kind} />
                <span className="font-semibold text-ink">{RULE_INFO[f.rule].title}</span>
              </div>
              <p className="mt-2 text-sm text-ink">{f.message}</p>
              {RULE_INFO[f.rule].clause && <div className="mt-2"><ClauseChip clause={RULE_INFO[f.rule].clause!} /></div>}
              {f.kind === 'error' && f.fix && (
                <button className={`${btn.primary} mt-3 w-full`} onClick={() => onFix(f)}>{f.fix.label}</button>
              )}
              {f.kind === 'alert' && (
                <p className="mt-3 flex items-center gap-2 text-sm font-medium text-warn">
                  <LockIcon /> Shared with AICTE. Cannot be cleared by the institution.
                </p>
              )}
            </div>
          ))}
          <h3 className="mt-6 text-xs font-semibold text-muted">Record</h3>
          <dl className="mt-2 divide-y divide-line rounded border border-line text-sm">
            {COLUMNS.map((c) => {
              const v = rr.row[c]
              const shown = c === 'APAAR_ID' && v ? (flaggedFields.has('APAAR_ID') ? v : formatApaar(v)) : v
              return (
                <div key={c} className={`flex justify-between gap-4 px-3 py-2 ${flaggedFields.has(c) ? 'bg-err-bg' : ''}`}>
                  <dt className="font-mono text-xs text-muted">{c}</dt>
                  <dd className={`text-right ${flaggedFields.has(c) ? 'font-semibold text-err' : 'text-ink'}`}>{shown || '—'}</dd>
                </div>
              )
            })}
          </dl>
          {rr.flags.some((f) => f.rule === 'R10') && (
            <p className="mt-3 text-xs text-muted">APAAR shown to AICTE as {maskApaar(rr.row.APAAR_ID)}</p>
          )}
        </div>
      </div>
    </div>
  )
}
