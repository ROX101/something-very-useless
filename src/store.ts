import { create } from 'zustand'
import type { Account } from './auth/directory'

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
  }
}

interface AppState {
  account: Account | null
  lang: Lang
  textSize: TextSize
  rememberedUserId: string
  signIn: (a: Account) => void
  signOut: () => void
  setLang: (l: Lang) => void
  setTextSize: (s: TextSize) => void
  setRememberedUserId: (id: string) => void
}

export const useApp = create<AppState>((set) => ({
  account: read<Account | null>('as.session', null),
  lang: read<Lang>('as.lang', 'en'),
  textSize: read<TextSize>('as.textSize', 'md'),
  rememberedUserId: read<string>('as.rememberedUserId', ''),
  signIn: (a) => { write('as.session', a); set({ account: a }) },
  signOut: () => { write('as.session', null); set({ account: null }) },
  setLang: (l) => { write('as.lang', l); set({ lang: l }) },
  setTextSize: (s) => { write('as.textSize', s); set({ textSize: s }) },
  setRememberedUserId: (id) => { write('as.rememberedUserId', id); set({ rememberedUserId: id }) },
}))
