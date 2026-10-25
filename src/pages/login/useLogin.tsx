import { useRef, useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useT } from '../../i18n'
import { audit } from '../../audit/log'
import { useApp } from '../../store'
import { DEMO_PASSWORD, ROLE_HOME, signIn } from '../../auth/directory'

type Field = 'userId' | 'password'

export function useLogin() {
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
  const userRef = useRef<HTMLInputElement>(null)
  const pwRef = useRef<HTMLInputElement>(null)
  const from = (location.state as { from?: string } | null)?.from

  const check = (f: Field, v: string) => (f === 'userId' ? (v.trim() ? undefined : t.errUserIdReq) : v ? undefined : t.errPasswordReq)
  const blur = (f: Field, v: string) => setFieldErr((e) => ({ ...e, [f]: check(f, v) }))
  const clear = (f: Field) => { setFieldErr((e) => (e[f] ? { ...e, [f]: undefined } : e)); setFormErr('') }

  function submit(e: FormEvent) {
    e.preventDefault()
    const fe = { userId: check('userId', userId), password: check('password', password) }
    setFieldErr(fe)
    setFormErr('')
    if (fe.userId) { userRef.current?.focus(); return }
    if (fe.password) { pwRef.current?.focus(); return }
    const r = signIn(userId, password)
    if (!r.ok) {
      audit('Sign-in', 'Sign-in failed', `${userId.trim()}: ${r.error === 'not_found' ? 'unknown user ID' : r.error === 'bad_password' ? 'wrong password' : 'domain not allowed for this role'}`)
      setFormErr(r.error === 'not_found' ? t.errNotFound : r.error === 'bad_password' ? t.errBadPassword : t.errDomain)
      return
    }
    setBusy(true)
    audit('Sign-in', 'Signed in', r.account.userId, r.account)
    setRememberedUserId(remember ? r.account.userId : '')
    window.setTimeout(() => {
      startSession(r.account)
      const home = ROLE_HOME[r.account.role]
      nav(from && from.startsWith(home) ? from : home, { replace: true })
    }, 600)
  }

  function fill(id: string) {
    setUserId(id)
    setPassword(DEMO_PASSWORD)
    setFieldErr({})
    setFormErr('')
  }

  return { t, userId, setUserId, password, setPassword, remember, setRemember, showPw, setShowPw, busy, fieldErr, formErr, userRef, pwRef, blur, clear, submit, fill }
}

export type LoginState = ReturnType<typeof useLogin>
