import { describe, expect, it } from 'vitest'
import { FORGED_JWS, GENUINE_JWS } from './credentials'
import { verifyCredential } from './crypto'

describe('certificate QR verification', () => {
  it('accepts the genuine certificate', async () => {
    const r = await verifyCredential(GENUINE_JWS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.credential.vc.credentialSubject.cgpa).toBe('8.42')
  })

  it('rejects the forged certificate with CGPA changed to 9.42', async () => {
    const r = await verifyCredential(FORGED_JWS)
    expect(r.ok).toBe(false)
    expect(r.steps.find((s) => s.label === 'Signature check')?.ok).toBe(false)
  })

  it('rejects text that is not a credential', async () => {
    expect((await verifyCredential('hello')).ok).toBe(false)
  })
})

describe('reading what a QR holds', () => {
  it('recognises a certificate link, a bare number and a token', async () => {
    const { readCode } = await import('./crypto')
    expect(readCode('https://apaar.example.in/c/GTU-2026-CSE-0417')).toEqual({ kind: 'link', certNo: 'GTU-2026-CSE-0417' })
    expect(readCode('gtu-2026-cse-0417')).toEqual({ kind: 'link', certNo: 'GTU-2026-CSE-0417' })
    expect(readCode(GENUINE_JWS)?.kind).toBe('token')
    expect(readCode('hello')).toBeNull()
  })
})
