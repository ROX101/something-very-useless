import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CLAUSES } from '../data/reference'
import type { FlagKind, RuleCode } from '../engine/types'

export function Clause({ clause }: { clause: string }) {
  if (!clause) return null
  const label = clause.startsWith('Def') ? `APH 2024-27, ${clause}` : `APH 2024-27, cl. ${clause}`
  return (
    <abbr title={CLAUSES[clause] ?? ''} className="cursor-help whitespace-nowrap text-sm text-navy underline decoration-navy/40 decoration-dotted underline-offset-4">
      {label}
    </abbr>
  )
}

const KIND_TEXT: Record<FlagKind, string> = { error: 'text-err', alert: 'text-warn', auto: 'text-info' }

export function RuleCodeTag({ rule, kind }: { rule: RuleCode; kind: FlagKind }) {
  return <span className={`inline-block w-12 shrink-0 font-semibold tnum ${KIND_TEXT[kind]}`}>{rule}</span>
}

export function CountUp({ value, duration = 800, className }: { value: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      setShown(Math.round(a + (value - a) * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <span className={className}>{shown.toLocaleString('en-IN')}</span>
}

export function Panel({ title, actions, children, className = '', flush }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`rounded border border-line bg-white ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      )}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  )
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-serif text-[1.75rem] font-medium leading-tight text-ink">{title}</h1>
        {sub && <p className="mt-1 text-[0.9375rem] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Notice({ tone, children, action }: { tone: 'deadline' | 'ok' | 'err' | 'warn'; children: ReactNode; action?: ReactNode }) {
  const t = {
    deadline: 'border-saffron bg-white',
    ok: 'border-ok bg-ok-bg',
    err: 'border-err bg-err-bg',
    warn: 'border-warn bg-warn-bg',
  }[tone]
  return (
    <div className={`flex flex-col gap-3 border-l-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${t}`} role={tone === 'err' ? 'alert' : undefined}>
      <div className="text-[0.9375rem] text-ink">{children}</div>
      {action}
    </div>
  )
}

export const btn = {
  primary: 'inline-flex items-center justify-center gap-2 rounded bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-45',
  secondary: 'inline-flex items-center justify-center gap-2 rounded border border-navy bg-white px-4 py-2.5 text-sm font-semibold text-navy hover:bg-navy-light disabled:opacity-45',
  link: 'text-sm font-semibold text-navy underline underline-offset-2 hover:text-navy-dark',
  ghost: 'inline-flex items-center gap-1.5 text-sm font-semibold text-navy underline underline-offset-2 hover:text-navy-dark',
}

export function LockIcon({ className = 'h-4 w-4 shrink-0' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export function maskApaar(a: string) {
  const d = a.replace(/\s/g, '')
  return d.length === 12 ? `${d.slice(0, 4)} •••• ••${d.slice(10)}` : a
}

export function formatApaar(a: string) {
  const d = a.replace(/\s/g, '')
  return /^\d{12}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}` : a
}

export function daysUntil(isoDate: string) {
  const end = new Date(`${isoDate}T23:59:59+05:30`).getTime()
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000))
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

export const th = 'px-4 py-2.5 text-left text-[0.8125rem] font-semibold text-muted'
export const td = 'px-4 py-3 align-top'

export const ClauseChip = Clause

export function RuleChip({ rule, kind }: { rule: RuleCode; kind: FlagKind }) {
  return <RuleCodeTag rule={rule} kind={kind} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded border border-line bg-white ${className}`}>{children}</div>
}

export const PageHeader = PageTitle
