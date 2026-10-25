import { useRef, useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useT } from '../../i18n'
import { ApiError, api } from '../../api'
import { useApp } from '../../store'
import { DEMO_PASSWORD, ROLE_HOME, type Account } from '../../auth/directory'

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

  async function submit(e: FormEvent) {
    e.preventDefault()
    const fe = { userId: check('userId', userId), password: check('password', password) }
    setFieldErr(fe)
    setFormErr('')
    if (fe.userId) { userRef.current?.focus(); return }
    if (fe.password) { pwRef.current?.focus(); return }
    setBusy(true)
    try {
      const { account } = await api.post<{ account: Account }>('/auth/login', { userId, password })
      setRememberedUserId(remember ? account.userId : '')
      startSession(account)
      const home = ROLE_HOME[account.role]
      nav(from && from.startsWith(home) ? from : home, { replace: true })
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'network'
      setFormErr(
        code === 'not_found' ? t.errNotFound
          : code === 'bad_password' ? t.errBadPassword
            : code === 'domain_policy' ? t.errDomain
              : err instanceof Error ? err.message : String(err),
      )
      setBusy(false)
    }
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
