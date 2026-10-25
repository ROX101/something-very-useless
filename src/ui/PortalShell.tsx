import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../store'
import { ROLE_LABEL } from '../auth/directory'

export interface PortalNavItem { to: string; label: string; end?: boolean; done?: boolean }

export function PortalShell({ children, nav = [], context, logo, showOrg = true }: { children: ReactNode; nav?: PortalNavItem[]; context?: ReactNode; logo?: ReactNode; showOrg?: boolean }) {
  const { account, signOut, lang, setLang } = useApp()
  const navigate = useNavigate()
  useEffect(() => {
    document.title = account ? `${ROLE_LABEL[account.role]} · APAAR-Sathi` : 'APAAR-Sathi'
  }, [account])
  if (!account) return null

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to main content
      </a>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-5">
            <Link to="/" className="text-2xl font-bold tracking-tight text-navy">APAAR-Sathi</Link>
            {showOrg && (
              <>
                <span className="hidden h-10 w-px bg-line sm:block" aria-hidden />
                {logo && <span className="hidden sm:block">{logo}</span>}
                <div className="hidden min-w-0 sm:block">
                  <p className="truncate font-semibold text-ink">{account.org}</p>
                  <p className="truncate text-sm text-muted">{context ?? account.scope}</p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-ink">{account.name}</p>
              <p className="text-xs text-muted">{ROLE_LABEL[account.role]}</p>
            </div>
            <button type="button" onClick={() => { signOut(); navigate('/', { replace: true }) }}
              className="rounded border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy-light">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <nav className="bg-navy" aria-label="Portal">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex gap-7 overflow-x-auto">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 whitespace-nowrap py-3 text-sm ${isActive ? 'font-semibold text-white after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-white' : 'text-white/80 hover:text-white'}`}>
                {n.label}
                {n.done && <svg className="h-3.5 w-3.5 text-[#8FD3A8]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" aria-label="done"><path d="M3 8.5l3.2 3L13 4.5" /></svg>}
              </NavLink>
            ))}
          </div>
          <button type="button" onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
            className="shrink-0 py-3 text-sm text-white/80 hover:text-white">
            {lang === 'en' ? 'हिन्दी' : 'English'}
          </button>
        </div>
      </nav>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted sm:px-6">© APAAR-Sathi</div>
      </footer>
    </div>
  )
}
