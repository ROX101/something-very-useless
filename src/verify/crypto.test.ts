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
