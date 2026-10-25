import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../store'
import { ACCOUNTS, DEMO_PASSWORD, ROLE_LABEL } from '../auth/directory'
import { resetAll } from '../sync'
import { useT } from '../i18n'
import { PURPOSES } from '../verify/consent'
import { audit } from '../audit/log'
import { useLogin, type LoginState } from './login/useLogin'

const icon = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

const MailIcon = () => <svg {...icon}><rect x="2" y="3.5" width="12" height="9" rx="1.2" /><path d="m2.5 4.5 5.5 4 5.5-4" /></svg>
const IdIcon = () => <svg {...icon}><rect x="2" y="3" width="12" height="10" rx="1.2" /><circle cx="6" cy="7.2" r="1.5" /><path d="M3.8 11c.5-1.2 1.3-1.8 2.2-1.8s1.7.6 2.2 1.8M10 6.5h2.5M10 9h2.5" /></svg>
const PhoneIcon = () => <svg {...icon}><rect x="4.5" y="1.5" width="7" height="13" rx="1.4" /><path d="M7 12.5h2" /></svg>
const OrgIcon = () => <svg {...icon}><path d="M2.5 14V4.5L8 2l5.5 2.5V14M2 14h12M5.5 7h1M9.5 7h1M5.5 10h1M9.5 10h1" /></svg>
const PurposeIcon = () => <svg {...icon}><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.5" /></svg>
const LockIcon = () => <svg {...icon}><rect x="3" y="7" width="10" height="7" rx="1.2" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  )
}

function Controls() {
  const { lang, setLang } = useApp()
  return (
    <div className="flex items-center text-xs">
      <label className="sr-only" htmlFor="lang">Language</label>
      <select id="lang" value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'hi')}
        className="h-11 cursor-pointer bg-transparent text-white/90 [&>option]:text-ink">
        <option value="en">English</option>
        <option value="hi">हिन्दी</option>
      </select>
    </div>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-28 items-center justify-center">
      <svg viewBox="0 0 128 112" className="absolute left-1/2 top-0 h-28 w-32 -translate-x-1/2" aria-hidden>
        <path d="M22 4h84c14 0 20 12 13 24L76 101c-6 10-18 10-24 0L9 28C2 16 8 4 22 4Z" fill="white" fillOpacity="0.07" />
      </svg>
      <h1 className="relative -mt-4 text-lg font-semibold uppercase tracking-wide text-[#5CC694]">{children}</h1>
    </div>
  )
}

function Field({ label, htmlFor, icon, error, errorId, children }: { label: string; htmlFor: string; icon: ReactNode; error?: string; errorId: string; children: ReactNode }) {
  return (
    <div>
      <div className={`flex gap-4 border-b pb-2 focus-within:border-b-2 focus-within:pb-[7px] ${error ? 'border-err focus-within:border-err' : 'border-line focus-within:border-[#23885A]'}`}>
        <span className={`mt-0.5 shrink-0 ${error ? 'text-err' : 'text-[#5CC694]'}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <label htmlFor={htmlFor} className="block text-sm tracking-wide text-muted">{label} <span aria-hidden>*</span></label>
          {children}
        </div>
      </div>
      {error && <p id={errorId} className="mt-2 pl-8 text-sm text-err">{error}</p>}
    </div>
  )
}

const pill = 'absolute bottom-0 left-1/2 flex h-12 min-w-[176px] -translate-x-1/2 translate-y-1/2 items-center justify-center gap-2 rounded-full bg-[#23885A] px-10 text-base font-semibold uppercase tracking-widest text-white shadow-[0_8px_24px_rgba(35,136,90,0.35)] transition-shadow duration-200 ease-out hover:bg-[#23885A] hover:shadow-[0_0_0_4px_rgba(92,198,148,0.25),0_0_28px_6px_rgba(92,198,148,0.55)] focus-visible:shadow-[0_0_0_4px_rgba(92,198,148,0.25),0_0_28px_6px_rgba(92,198,148,0.55)] disabled:bg-[#23885A] disabled:opacity-100'
const input = 'mt-1 h-9 w-full bg-transparent text-base font-medium text-ink placeholder:font-normal placeholder:text-muted/60 focus:outline-none'

function SignInPanel({ s }: { s: LoginState }) {
  const { t } = s
  return (
    <form aria-label={t.signIn} noValidate onSubmit={s.submit}
      className="on-light relative rounded-2xl bg-[#FFFFFF] px-6 pb-9 pt-8 text-ink shadow-[0_24px_48px_rgba(0,0,0,0.35)] sm:px-8">
      {s.formErr && <div role="alert" className="mb-6 rounded-lg border border-err/25 bg-err-bg px-4 py-3 text-sm text-err">{s.formErr}</div>}
      <div className="space-y-6">
        <Field label={t.userId} htmlFor="userId" icon={<MailIcon />} error={s.fieldErr.userId} errorId="userId-err">
          <input ref={s.userRef} id="userId" name="userId" autoComplete="username" value={s.userId} aria-required="true"
            onChange={(e) => { s.setUserId(e.target.value); s.clear('userId') }} onBlur={(e) => s.blur('userId', e.target.value)}
            placeholder={t.userIdPh} aria-invalid={Boolean(s.fieldErr.userId)} aria-describedby={s.fieldErr.userId ? 'userId-err' : undefined}
            className={input} />
        </Field>
        <Field label={t.password} htmlFor="password" icon={<LockIcon />} error={s.fieldErr.password} errorId="password-err">
          <div className="flex items-center">
            <input ref={s.pwRef} id="password" name="password" type={s.showPw ? 'text' : 'password'} autoComplete="current-password"
              value={s.password} aria-required="true"
              onChange={(e) => { s.setPassword(e.target.value); s.clear('password') }} onBlur={(e) => s.blur('password', e.target.value)}
              aria-invalid={Boolean(s.fieldErr.password)} aria-describedby={s.fieldErr.password ? 'password-err' : undefined}
              className={`${input} tracking-wider`} />
            <button type="button" onClick={() => s.setShowPw((v) => !v)} aria-label={s.showPw ? t.hidePw : t.showPw} aria-pressed={s.showPw}
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted hover:text-ink">
              <EyeIcon off={s.showPw} />
            </button>
          </div>
        </Field>
      </div>
      <div className="mt-2 flex justify-end">
        <Link to="/forgot-password" className="inline-flex min-h-11 items-center text-xs font-semibold text-[#1A6E48] underline-offset-2 hover:underline">{t.forgot}</Link>
      </div>
      <button type="submit" disabled={s.busy} aria-busy={s.busy} className={`${pill} disabled:cursor-wait`}>
        {s.busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden />}
        {s.busy ? t.signingIn : t.signIn}
      </button>
    </form>
  )
}

function Demo({ s }: { s: LoginState }) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const resetBtn = useRef<HTMLButtonElement>(null)
  const close = () => { dialog.current?.close(); resetBtn.current?.focus() }
  return (
    <div className="mt-6">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="demo-accounts"
        className="mx-auto flex h-12 items-center gap-2 rounded-full border border-dashed border-white/45 px-8 text-sm font-semibold uppercase tracking-wider text-white hover:border-white/80">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className={open ? 'rotate-90' : ''}><path d="M6 3.5 10.5 8 6 12.5" /></svg>
        {s.t.demo}
      </button>
      {open && (
        <div id="demo-accounts" className="mt-6 rounded-2xl border border-white/15 bg-white/[0.06] p-4">
          <p className="mb-2 px-2 text-sm text-white/75">
            {s.t.demoNote} <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white">{DEMO_PASSWORD}</code>
          </p>
          <ul className="divide-y divide-white/10">
            {ACCOUNTS.map((a) => (
              <li key={a.userId}>
                <button type="button" onClick={() => s.fill(a.userId)}
                  className="flex min-h-12 w-full items-center justify-between gap-4 rounded-lg px-2 py-2 text-left hover:bg-white/[0.06]">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">{a.userId}</span>
                    <span className="block truncate text-xs text-white/60">{a.org}</span>
                  </span>
                  <span className="shrink-0 text-xs text-white/60">{ROLE_LABEL[a.role]}</span>
                </button>
              </li>
            ))}
          </ul>
          <button ref={resetBtn} type="button" onClick={() => dialog.current?.showModal()}
            className="ml-2 mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#FDA29B] underline underline-offset-2">Reset demo data</button>
        </div>
      )}
      <dialog ref={dialog} aria-labelledby="reset-title" onCancel={(e) => { e.preventDefault(); close() }}
        onClick={(e) => { if (e.target === dialog.current) close() }}
        className="on-light w-[calc(100%-32px)] max-w-md rounded-2xl border border-line bg-white p-0 text-ink shadow-[0_8px_32px_rgba(16,24,40,0.06)] backdrop:bg-[#000000]/60">
        <div className="p-6">
          <h2 id="reset-title" className="text-xl font-semibold leading-tight">Reset demo data on every device?</h2>
          <p className="mt-2 text-sm leading-normal text-muted">This clears every uploaded file, submission, consent request and AICTE case decision, and returns all signed-in devices to the starting data. It cannot be undone.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">
          <button type="button" autoFocus onClick={close} className="min-h-11 rounded-full border border-line bg-white px-5 text-sm font-semibold text-ink hover:bg-page">Cancel</button>
          <button type="button" onClick={() => { dialog.current?.close(); void resetAll() }} className="min-h-11 rounded-full bg-err px-5 text-sm font-semibold text-white hover:bg-err/90">Reset demo data</button>
        </div>
      </dialog>
    </div>
  )
}

function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const t = useT()
  return (
    <div className="on-dark flex min-h-screen flex-col bg-black bg-[linear-gradient(165deg,#000000_0%,#0B0C10_55%,#2A2C33_100%)] text-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-ink">{t.skip}</a>
      <header className="mx-auto flex w-full max-w-none lg:px-10 items-center justify-between gap-4 px-4 pt-2 sm:px-6">
        <Link to="/" className="inline-flex min-h-11 items-center text-xl font-semibold tracking-tight">APAAR</Link>
        <Controls />
      </header>

      <main id="main" className="flex flex-1 justify-center px-4 pb-12 pt-4 sm:pt-10">
        <div className="w-full max-w-[420px]">
          <Heading>{title}</Heading>
          <div className="mt-2">{children}</div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-none lg:px-10 px-4 pb-6 sm:px-6">
        <div className="flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-white/60">{t.copyright}</span>
          <div className="flex flex-wrap gap-x-5 text-sm">
            <Link to="/privacy" className="inline-flex min-h-11 items-center text-white/70 hover:text-white">{t.privacy}</Link>
            <Link to="/terms" className="inline-flex min-h-11 items-center text-white/70 hover:text-white">{t.terms}</Link>
            <Link to="/accessibility" className="inline-flex min-h-11 items-center text-white/70 hover:text-white">{t.accessibility}</Link>
            <Link to="/help" className="inline-flex min-h-11 items-center text-white/70 hover:text-white">{t.help}</Link>
          </div>
        </div>
        <p className="mt-2 text-xs text-white/50">{t.footNote}</p>
      </footer>
    </div>
  )
}

const smallLink = 'inline-flex min-h-11 items-center font-semibold text-[#5CC694] underline underline-offset-2 hover:text-white'

export default function Login() {
  const s = useLogin()
  const { t } = s
  return (
    <AuthShell title={t.signIn}>
      <SignInPanel s={s} />
      <p className="mt-10 text-center text-xs text-white/70">
        {t.newTo}{' '}
        <Link to="/register" className={smallLink}>{t.register}</Link>
      </p>
      <Demo s={s} />
    </AuthShell>
  )
}

type Kind = 'student' | 'org'
type RegField = 'apaar' | 'mobile' | 'org' | 'email'

const RULES: Record<RegField, (v: string) => string | undefined> = {
  apaar: (v) => (/^\d{12}$/.test(v.replace(/\s/g, '')) ? undefined : 'Enter your 12-digit APAAR ID.'),
  mobile: (v) => (/^[6-9]\d{9}$/.test(v.replace(/\s/g, '')) ? undefined : 'Enter a 10-digit mobile number.'),
  org: (v) => (v.trim().length > 1 ? undefined : 'Enter the name of your organisation.'),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? undefined : 'Enter a work email like name@company.com.'),
}

export function Register() {
  const t = useT()
  const [kind, setKind] = useState<Kind>('student')
  const [v, setV] = useState<Record<RegField, string>>({ apaar: '', mobile: '', org: '', email: '' })
  const [purpose, setPurpose] = useState<string>(PURPOSES[0].id)
  const [err, setErr] = useState<Partial<Record<RegField, string>>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const refs = useRef<Partial<Record<RegField, HTMLInputElement | null>>>({})
  const fields: RegField[] = kind === 'student' ? ['apaar', 'mobile'] : ['org', 'email']

  const change = (f: RegField, val: string) => { setV((x) => ({ ...x, [f]: val })); setErr((e) => (e[f] ? { ...e, [f]: undefined } : e)) }
  const blur = (f: RegField) => setErr((e) => ({ ...e, [f]: RULES[f](v[f]) }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const next: Partial<Record<RegField, string>> = {}
    fields.forEach((f) => { next[f] = RULES[f](v[f]) })
    setErr(next)
    const first = fields.find((f) => next[f])
    if (first) { refs.current[first]?.focus(); return }
    setBusy(true)
    const ref = `REG-2026-${String(Math.floor(10000 + Math.random() * 89999))}`
    const who = kind === 'student'
      ? { name: 'Student applicant', role: 'Public', org: '' }
      : { name: v.email.trim(), role: 'Public', org: v.org.trim() }
    audit('Registration', 'Registration request received', kind === 'student'
      ? `${ref}, student, APAAR ${v.apaar.replace(/\s/g, '').slice(0, 4)} •••• ••${v.apaar.replace(/\s/g, '').slice(-2)}`
      : `${ref}, organisation, ${PURPOSES.find((p) => p.id === purpose)?.label ?? ''}`, who)
    window.setTimeout(() => { setBusy(false); setDone(ref) }, 600)
  }

  const input2 = (f: RegField, extra: Record<string, string> = {}) => (
    <input ref={(el) => { refs.current[f] = el }} id={`reg-${f}`} value={v[f]} aria-required="true"
      onChange={(e) => change(f, e.target.value)} onBlur={() => blur(f)}
      aria-invalid={Boolean(err[f])} aria-describedby={err[f] ? `reg-${f}-err` : undefined}
      className={input} {...extra} />
  )

  return (
    <AuthShell title={t.register.split(' ')[0]}>
      {done ? (
        <div className="on-light relative rounded-2xl bg-[#FFFFFF] px-6 pb-14 pt-8 text-center text-ink shadow-[0_24px_48px_rgba(0,0,0,0.35)] sm:px-8" role="status">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#23885A]/10 text-[#23885A]" aria-hidden>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 12.5 4 4 8-9" /></svg>
          </span>
          <h2 className="mt-4 text-xl font-semibold leading-tight">Registration received</h2>
          <p className="mt-1 font-mono text-sm text-muted">{done}</p>
          <p className="mx-auto mt-4 max-w-[34ch] text-sm leading-normal text-muted">
            {kind === 'student'
              ? 'Your sign-in details will be sent by SMS once your APAAR ID and mobile number are confirmed.'
              : 'Your organisation will be reviewed. Sign-in details will be sent to your work email once it is approved.'}
          </p>
          <Link to="/" className={pill}>{t.signIn}</Link>
        </div>
      ) : (
        <form aria-label={t.register} noValidate onSubmit={submit}
          className="on-light relative rounded-2xl bg-[#FFFFFF] px-6 pb-14 pt-6 text-ink shadow-[0_24px_48px_rgba(0,0,0,0.35)] sm:px-8">
          <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 rounded-full border border-line p-1">
            {([['student', 'Student'], ['org', 'Organisation']] as [Kind, string][]).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setErr({}) }}
                className={`min-h-10 rounded-full text-sm font-semibold ${kind === k ? 'bg-[#23885A] text-white' : 'text-muted hover:text-ink'}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-muted">Institution and AICTE accounts are issued by AICTE.</p>

          <div className="mt-6 space-y-6">
            {kind === 'student' ? (
              <>
                <Field label="APAAR ID" htmlFor="reg-apaar" icon={<IdIcon />} error={err.apaar} errorId="reg-apaar-err">
                  {input2('apaar', { inputMode: 'numeric', autoComplete: 'off', placeholder: '12 digits' })}
                </Field>
                <Field label="Mobile number" htmlFor="reg-mobile" icon={<PhoneIcon />} error={err.mobile} errorId="reg-mobile-err">
                  {input2('mobile', { type: 'tel', inputMode: 'numeric', autoComplete: 'tel-national', placeholder: '98765 43210' })}
                </Field>
              </>
            ) : (
              <>
                <Field label="Organisation" htmlFor="reg-org" icon={<OrgIcon />} error={err.org} errorId="reg-org-err">
                  {input2('org', { autoComplete: 'organization', placeholder: 'Tarang Software Pvt. Ltd.' })}
                </Field>
                <Field label="Work email" htmlFor="reg-email" icon={<MailIcon />} error={err.email} errorId="reg-email-err">
                  {input2('email', { type: 'email', autoComplete: 'email', placeholder: 'name@company.com' })}
                </Field>
                <Field label="Purpose of verification" htmlFor="reg-purpose" icon={<PurposeIcon />} errorId="reg-purpose-err">
                  <select id="reg-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} className={`${input} cursor-pointer`}>
                    {PURPOSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
              </>
            )}
          </div>

          <button type="submit" disabled={busy} aria-busy={busy} className={`${pill} disabled:cursor-wait`}>
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden />}
            {t.register.split(' ')[0]}
          </button>
        </form>
      )}
      {!done && (
        <p className="mt-10 text-center text-xs text-white/70">
          Already have an account?{' '}
          <Link to="/" className={smallLink}>{t.signIn}</Link>
        </p>
      )}
    </AuthShell>
  )
}
