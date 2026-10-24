import { describe, expect, it } from 'vitest'
import { ACCOUNTS, AICTE_DOMAIN, AICTE_ROLES, DEMO_PASSWORD, ROLE_HOME, signIn } from './directory'

describe('sign-in', () => {
  it('routes every demo account to its own portal', () => {
    for (const a of ACCOUNTS) {
      const r = signIn(a.userId, DEMO_PASSWORD)
      expect(r.ok).toBe(true)
      if (r.ok) expect(ROLE_HOME[r.account.role]).toBeTruthy()
    }
  })

  it('only @aicte-india.org accounts hold AICTE roles', () => {
    for (const a of ACCOUNTS) {
      expect(a.userId.endsWith('@' + AICTE_DOMAIN)).toBe(AICTE_ROLES.includes(a.role))
    }
  })

  it('accepts case and spacing differences', () => {
    expect(signIn('  Meena.Iyer@AICTE-India.org ', DEMO_PASSWORD).ok).toBe(true)
    expect(signIn('4471 2093 6618', DEMO_PASSWORD).ok).toBe(true)
  })

  it('rejects unknown users and wrong passwords', () => {
    expect(signIn('someone@aicte-india.com', DEMO_PASSWORD)).toEqual({ ok: false, error: 'not_found' })
    expect(signIn('meena.iyer@aicte-india.org', 'wrong')).toEqual({ ok: false, error: 'bad_password' })
  })
})
