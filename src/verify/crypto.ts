import { compactVerify, importJWK } from 'jose'
import { ISSUER_KEY } from './credentials'

export interface Issuer {
  kid: string
  name: string
  did: string
  status: 'registered' | 'suspended'
}

export const ISSUERS: Issuer[] = [
  { kid: ISSUER_KEY.kid, name: 'Godavari Technological University', did: 'did:web:godavaritu.edu.in', status: 'registered' },
]

export const REVOKED_INDEXES = new Set<string>()

export interface Credential {
  iss: string
  jti: string
  nbf: number
  vc: {
    type: string[]
    credentialSubject: {
      apaar: string
      sid: string
      name: string
      degree: string
      year: number
      cgpa: string
      div: string
    }
    status: number
  }
}

export type Step = { label: string; ok: boolean; detail: string }

export type VerifyResult =
  | { ok: true; issuer: Issuer; credential: Credential; steps: Step[] }
  | { ok: false; reason: string; steps: Step[] }

function decodePart<T>(part: string): T | null {
  try {
    const s = part.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    return null
  }
}

export async function verifyCredential(raw: string): Promise<VerifyResult> {
  const jws = raw.trim()
  const steps: Step[] = []
  const parts = jws.split('.')
  const header = parts.length === 3 ? decodePart<{ alg: string; kid: string }>(parts[0]) : null
  if (!header) {
    steps.push({ label: 'Read the code', ok: false, detail: 'Not a signed credential' })
    return { ok: false, reason: 'This QR code is not a signed APAAR-Sathi credential.', steps }
  }
  steps.push({ label: 'Read the code', ok: true, detail: `${header.alg}, key ${header.kid}` })

  const issuer = ISSUERS.find((i) => i.kid === header.kid)
  if (!issuer || issuer.status !== 'registered') {
    steps.push({ label: 'Issuer registry', ok: false, detail: 'Key not in the registry' })
    return { ok: false, reason: 'Not issued by a registered issuer.', steps }
  }
  steps.push({ label: 'Issuer registry', ok: true, detail: `${issuer.name}, registered` })

  let credential: Credential
  try {
    const key = await importJWK({ kty: ISSUER_KEY.kty, crv: ISSUER_KEY.crv, x: ISSUER_KEY.x, y: ISSUER_KEY.y }, 'ES256')
    const { payload } = await compactVerify(jws, key)
    credential = JSON.parse(new TextDecoder().decode(payload)) as Credential
  } catch {
    steps.push({ label: 'Signature check', ok: false, detail: 'ECDSA P-256 signature does not match' })
    return { ok: false, reason: 'The certificate was altered after it was issued, or was not issued by this university.', steps }
  }
  steps.push({ label: 'Signature check', ok: true, detail: 'ECDSA P-256 signature matches' })

  if (REVOKED_INDEXES.has(String(credential.vc.status))) {
    steps.push({ label: 'Revocation list', ok: false, detail: 'Revoked by the issuer' })
    return { ok: false, reason: 'This credential has been revoked by the issuer.', steps }
  }
  steps.push({ label: 'Revocation list', ok: true, detail: 'Not revoked' })

  return { ok: true, issuer, credential, steps }
}
