import { NavLink, Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useApp, type TextSize } from '../store'
import { useT } from '../i18n'

function UtilityBar() {
  const t = useT()
  const { lang, setLang, textSize, setTextSize } = useApp()
  const sizes: { k: TextSize; label: string; aria: string }[] = [
    { k: 'sm', label: 'A−', aria: 'Decrease text size' },
    { k: 'md', label: 'A', aria: 'Default text size' },
    { k: 'lg', label: 'A+', aria: 'Increase text size' },
  ]
  return (
    <div className="border-b border-line bg-white text-xs text-muted">
      <div className="mx-auto flex h-10 max-w-6xl items-center justify-between px-4 sm:px-6">
        <span className="truncate">{t.orgLine}</span>
        <div className="flex items-center gap-3 sm:gap-4">
          <a href="#main" className="hidden text-ink hover:underline sm:inline">{t.skip}</a>
          <span className="hidden h-4 w-px bg-slate-300 sm:block" aria-hidden />
          <div className="flex items-center gap-2" role="group" aria-label="Text size">
            {sizes.map((s) => (
              <button key={s.k} type="button" aria-label={s.aria} aria-pressed={textSize === s.k}
                onClick={() => setTextSize(s.k)}
                className={`rounded px-1 ${textSize === s.k ? 'font-semibold text-navy underline' : 'text-ink hover:text-navy'}`}>
                {s.label}
              </button>
            ))}
          </div>
          <span className="h-4 w-px bg-slate-300" aria-hidden />
          <label className="sr-only" htmlFor="lang">Language</label>
          <select id="lang" value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'hi')}
            className="cursor-pointer bg-transparent text-ink focus:outline-none">
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
        </div>
      </div>
    </div>
  )
}

function Masthead() {
  const t = useT()
  return (
    <header className="bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <Link to="/" className="flex items-center gap-5">
          <span className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">APAAR-Sathi</span>
          <span className="hidden h-12 w-px bg-slate-300 sm:block" aria-hidden />
          <span className="hidden sm:block">
            <span className="block text-lg font-semibold text-ink">{t.brandSub}</span>
            <span className="block text-sm text-muted">{t.brandTag}</span>
          </span>
        </Link>
      </div>
    </header>
  )
}

function NavBar() {
  const t = useT()
  const item = ({ isActive }: { isActive: boolean }) =>
    `relative py-3 text-sm ${isActive ? 'font-semibold text-white after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-white' : 'text-white/85 hover:text-white'}`
  return (
    <nav className="bg-navy" aria-label="Main">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex gap-6 overflow-x-auto">
          <NavLink to="/" end className={item}>{t.navLogin}</NavLink>
          <NavLink to="/guidance" className={item}>{t.navGuidance}</NavLink>
          <NavLink to="/help" className={item}>{t.navHelp}</NavLink>
        </div>
        <NavLink to="/about" className="hidden items-center gap-2 text-sm text-white/85 hover:text-white md:flex">
          {t.navAbout}
        </NavLink>
      </div>
    </nav>
  )
}

function Footer() {
  const t = useT()
  return (
    <footer className="border-t border-line bg-white text-sm">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-ink">{t.copyright}</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink">
            <Link to="/privacy" className="hover:underline">{t.privacy}</Link>
            <span className="text-slate-300" aria-hidden>|</span>
            <Link to="/terms" className="hover:underline">{t.terms}</Link>
            <span className="text-slate-300" aria-hidden>|</span>
            <Link to="/accessibility" className="hover:underline">{t.accessibility}</Link>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted">{t.footNote}</p>
      </div>
    </footer>
  )
}

export function PublicLayout({ crumb, children }: { crumb: string; children: ReactNode }) {
  const t = useT()
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        {t.skip}
      </a>
      <UtilityBar />
      <Masthead />
      <NavBar />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
          <Link to="/" className="hover:underline">{t.home}</Link>
          <span className="mx-2 text-muted">/</span>
          <span className="text-ink">{crumb}</span>
        </nav>
        {children}
      </main>
      <Footer />
    </div>
  )
}
