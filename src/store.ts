import { create } from 'zustand'
import type { Account } from './auth/directory'
import { api } from './api'

export type Lang = 'en' | 'hi'
export type TextSize = 'sm' | 'md' | 'lg'

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}

const resetters = new Set<() => void>()
/** Feature stores register here so signing out clears every portal's in-memory data. */
export function onSignOut(fn: () => void) { resetters.add(fn) }

interface AppState {
  account: Account | null
  lang: Lang
  textSize: TextSize
  rememberedUserId: string
  signIn: (a: Account) => void
  signOut: () => void
  /** Drops the local session without calling the server (used when the server says the session is gone). */
  clearSession: () => void
  setLang: (l: Lang) => void
  setTextSize: (s: TextSize) => void
  setRememberedUserId: (id: string) => void
}

export const useApp = create<AppState>((set, get) => ({
  // The account is cached only for a fast first paint. The httpOnly cookie is the real session,
  // and App checks it with /api/auth/me on start.
  account: read<Account | null>('as.session', null),
  lang: read<Lang>('as.lang', 'en'),
  textSize: read<TextSize>('as.textSize', 'md'),
  rememberedUserId: read<string>('as.rememberedUserId', ''),
  signIn: (a) => { write('as.session', a); set({ account: a }) },
  signOut: () => {
    api.post('/auth/logout').catch(() => undefined)
    get().clearSession()
  },
  clearSession: () => {
    write('as.session', null)
    resetters.forEach((fn) => fn())
    set({ account: null })
  },
  setLang: (l) => { write('as.lang', l); set({ lang: l }) },
  setTextSize: (s) => { write('as.textSize', s); set({ textSize: s }) },
  setRememberedUserId: (id) => { write('as.rememberedUserId', id); set({ rememberedUserId: id }) },
}))
