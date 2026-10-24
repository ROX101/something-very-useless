import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { PublicLayout } from '../ui/PublicLayout'
import { useT } from '../i18n'
import { useApp } from '../store'
import { ACCOUNTS, DEMO_PASSWORD, ROLE_HOME, ROLE_LABEL, signIn } from '../auth/directory'
import { resetAll } from '../sync'

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  )
}

export default function Login() {
  const t = useT()
  const nav = useNavigate()
  const location = useLocation()
  const { rememberedUserId, setRememberedUserId, signIn: startSession } = useApp()

  const [userId, setUserId] = useState(rememberedUserId)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(Boolean(rememberedUserId))
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fieldErr, setFieldErr] = useState<{ userId?: string; password?: string }>({})
  const [formErr, setFormErr] = useState('')
  const [demoOpen, setDemoOpen] = useState(false)

  const from = (location.state as { from?: string } | null)?.from

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const fe: typeof fieldErr = {}
    if (!userId.trim()) fe.userId = t.errUserIdReq
    if (!password) fe.password = t.errPasswordReq
    setFieldErr(fe)
    setFormErr('')
    if (fe.userId || fe.password) return

    const r = signIn(userId, password)
    if (!r.ok) {
      setFormErr(r.error === 'not_found' ? t.errNotFound : r.error === 'bad_password' ? t.errBadPassword : t.errDomain)
      return
    }
    setBusy(true)
    setRememberedUserId(remember ? r.account.userId : '')
    window.setTimeout(() => {
      startSession(r.account)
      const home = ROLE_HOME[r.account.role]
      nav(from && from.startsWith(home) ? from : home, { replace: true })
    }, 600)
  }

  function fillDemo(id: string) {
    setUserId(id)
    setPassword(DEMO_PASSWORD)
    setFieldErr({})
    setFormErr('')
  }

  const inputBase =
    'h-12 w-full rounded border bg-white px-3 text-[15px] text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-navy/40'

  return (
    <PublicLayout crumb={t.navLogin}>
      <div className="grid overflow-hidden border border-line bg-white md:grid-cols-[1fr_1.15fr]">
        <section className="flex flex-col bg-[#F3F4F6] p-8 md:border-r md:border-line md:p-10">
          <p className="text-xs font-semibold text-navy">{t.eyebrow}</p>
          <h1 className="mt-4 font-serif text-[28px] leading-tight text-ink md:text-[30px]">{t.heroTitle}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">{t.heroBody}</p>

          <div className="mt-12 space-y-6">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">{t.tip1Title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t.tip1Body}</p>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">{t.tip2Title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t.tip2Body}</p>
            </div>
          </div>

          <div className="mt-auto border-t border-line pt-4 md:mt-14">
            <p className="text-[15px] font-semibold text-ink">{t.assist}</p>
            <div className="mt-3 flex gap-6 text-sm">
              <Link to="/guidance" className="text-navy underline underline-offset-2">{t.manual}</Link>
              <Link to="/help" className="text-navy underline underline-offset-2">{t.help}</Link>
            </div>
          </div>
        </section>

        <section className="order-first p-8 md:order-none md:p-10 md:px-12">
          <h2 className="text-[28px] font-semibold text-ink">{t.signIn}</h2>
          <p className="mt-2 text-sm text-muted">{t.signInSub}</p>

          {formErr && (
            <div role="alert" className="mt-5 rounded border-l-4 border-err bg-err-bg px-4 py-3 text-sm text-err">
              {formErr}
            </div>
          )}

          <form noValidate onSubmit={onSubmit} className="mt-6 space-y-6">
            <div>
              <label htmlFor="userId" className="block text-sm font-semibold text-ink">
                {t.userId} <span aria-hidden>*</span>
              </label>
              <input id="userId" name="userId" autoComplete="username" value={userId}
                onChange={(e) => setUserId(e.target.value)} placeholder={t.userIdPh}
                aria-invalid={Boolean(fieldErr.userId)} aria-describedby={fieldErr.userId ? 'userId-err' : undefined}
                className={`${inputBase} mt-2 ${fieldErr.userId ? 'border-err' : 'border-line'}`} />
              {fieldErr.userId && <p id="userId-err" className="mt-1.5 text-sm text-err">{fieldErr.userId}</p>}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-ink">
                {t.password} <span aria-hidden>*</span>
              </label>
              <div className="relative mt-2">
                <input id="password" name="password" type={showPw ? 'text' : 'password'} autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.passwordPh}
                  aria-invalid={Boolean(fieldErr.password)} aria-describedby={fieldErr.password ? 'password-err' : undefined}
                  className={`${inputBase} pr-12 ${fieldErr.password ? 'border-err' : 'border-line'}`} />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? t.hidePw : t.showPw}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-navy">
                  <EyeIcon off={showPw} />
                </button>
              </div>
              {fieldErr.password && <p id="password-err" className="mt-1.5 text-sm text-err">{fieldErr.password}</p>}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded-[2px] border-slate-400 accent-navy" />
                {t.remember}
              </label>
              <Link to="/forgot-password" className="text-sm text-navy underline underline-offset-2">{t.forgot}</Link>
            </div>

            <button type="submit" disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded bg-navy text-[15px] font-semibold text-white transition hover:bg-navy-dark disabled:opacity-80">
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
              {busy ? t.signingIn : t.signIn}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ink">
            {t.newTo}{' '}
            <Link to="/register" className="font-semibold text-navy underline underline-offset-2">{t.register}</Link>
          </p>

          <div className="mt-8 border-t border-dashed border-line pt-4">
            <button type="button" onClick={() => setDemoOpen((v) => !v)} aria-expanded={demoOpen}
              className="text-xs font-semibold text-muted hover:text-navy">
              {demoOpen ? '▾' : '▸'} {t.demo}
            </button>
            {demoOpen && (
              <div className="mt-3">
                <p className="mb-2 text-xs text-muted">
                  {t.demoNote} <code className="rounded bg-page px-1.5 py-0.5 text-ink">{DEMO_PASSWORD}</code>
                </p>
                <ul className="divide-y divide-line rounded border border-line text-sm">
                  {ACCOUNTS.map((a) => (
                    <li key={a.userId}>
                      <button type="button" onClick={() => fillDemo(a.userId)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-page">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{a.userId}</span>
                          <span className="block truncate text-xs text-muted">{a.org}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {ROLE_LABEL[a.role]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => { if (window.confirm('Clear all uploads, submissions, consents and AICTE decisions on every device?')) void resetAll() }}
                  className="mt-3 text-xs font-semibold text-err underline underline-offset-2">Reset demo data</button>
              </div>
            )}
          </div>
        </section>
      </div>
    </PublicLayout>
  )
}
