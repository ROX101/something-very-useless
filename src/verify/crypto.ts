import { compactVerify, importJWK, type JWK } from 'jose'
import { ISSUER_KEY } from './credentials'

export interface Issuer {
  kid: string
  name: string
  did: string
  status: 'registered' | 'suspended'
  jwk?: JWK
}

/**
 * Offline fallback: the key behind the sample QR tokens in credentials.ts. Live issuers come from the
 * platform's trust registry (/api/public/issuers).
 */
const BUNDLED: Issuer[] = [
  { kid: ISSUER_KEY.kid, name: 'Godavari Technological University', did: 'did:web:godavaritu.edu.in', status: 'registered', jwk: { kty: ISSUER_KEY.kty, crv: ISSUER_KEY.crv, x: ISSUER_KEY.x, y: ISSUER_KEY.y } },
]

/** @deprecated kept for the bundled sample tokens, which predate status lists. */
export const REVOKED_INDEXES = new Set<string>()

export interface CredentialStatus { type: string; statusPurpose: string; statusListIndex: string; statusListCredential: string }

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
      cgpa?: string
      div?: string
    }
    credentialStatus?: CredentialStatus
    status?: number
  }
}

export type Step = { label: string; ok: boolean; detail: string }

export type VerifyResult =
  | { ok: true; issuer: Issuer; credential: Credential; steps: Step[]; certNo: string; source: 'link' | 'token' }
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

let registryCache: Promise<Issuer[]> | null = null
/** The platform's trust registry, with the bundled key as an offline fallback. */
export function issuerRegistry(): Promise<Issuer[]> {
  if (!registryCache) {
    registryCache = fetch('/api/public/issuers')
      .then((r) => (r.ok ? (r.json() as Promise<Issuer[]>) : []))
      .catch(() => [] as Issuer[])
      .then((live) => [...live, ...BUNDLED.filter((b) => !live.some((l) => l.kid === b.kid))])
    // refresh after a while so a suspended issuer is noticed
    setTimeout(() => { registryCache = null }, 5 * 60 * 1000)
  }
  return registryCache
}

const CERT_NO = /^[A-Z]{2,12}-\d{4}-[A-Z0-9&]{2,16}-\d{3,5}$/

/** A QR may hold a link to /c/<certificate number>, a bare certificate number, or (older cards) the signed token itself. */
export function readCode(raw: string): { kind: 'link'; certNo: string } | { kind: 'token'; jws: string } | null {
  const s = raw.trim()
  const link = /\/c\/([A-Za-z0-9-]+)\/?(?:[?#].*)?$/.exec(s)
  if (link) return { kind: 'link', certNo: decodeURIComponent(link[1]).toUpperCase() }
  if (CERT_NO.test(s.toUpperCase())) return { kind: 'link', certNo: s.toUpperCase() }
  if (s.split('.').length === 3) return { kind: 'token', jws: s }
  return null
}

async function checkStatus(status: CredentialStatus, registry: Issuer[]): Promise<boolean | null> {
  try {
    const url = new URL(status.statusListCredential, window.location.origin)
    if (url.origin !== window.location.origin) return null
    const res = await fetch(url.pathname)
    if (!res.ok) return null
    const { jws } = (await res.json()) as { jws: string }
    const header = decodePart<{ kid: string }>(jws.split('.')[0])
    const issuer = registry.find((i) => i.kid === header?.kid)
    if (!issuer?.jwk) return null
    const { payload } = await compactVerify(jws, await importJWK(issuer.jwk, 'ES256'))
    const list = JSON.parse(new TextDecoder().decode(payload)) as { vc: { credentialSubject: { encodedList: string } } }
    const encoded = list.vc.credentialSubject.encodedList.slice(1)
    const gz = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4)), (c) => c.charCodeAt(0))
    const bits = new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
    const i = Number(status.statusListIndex)
    return (bits[i >> 3] & (0x80 >> (i & 7))) !== 0
  } catch {
    return null
  }
}

/** Fetches the public summary behind a certificate link. */
async function fetchPublic(certNo: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/public/c/${encodeURIComponent(certNo)}`)
    if (!r.ok) return null
    return ((await r.json()) as { jws: string }).jws
  } catch {
    return null
  }
}

export async function verifyCredential(raw: string): Promise<VerifyResult> {
  const steps: Step[] = []
  const code = readCode(raw)
  if (!code) {
    steps.push({ label: 'Read the code', ok: false, detail: 'Not a certificate link or signed credential' })
    return { ok: false, reason: 'This QR code is not an APAAR certificate.', steps }
  }

  let jws: string
  if (code.kind === 'link') {
    const fetched = await fetchPublic(code.certNo)
    if (!fetched) {
      steps.push({ label: 'Look up the certificate', ok: false, detail: `${code.certNo} not found` })
      return { ok: false, reason: `No certificate ${code.certNo} has been issued.`, steps }
    }
    steps.push({ label: 'Look up the certificate', ok: true, detail: `${code.certNo}, public summary` })
    jws = fetched
  } else {
    jws = code.jws
  }

  const header = decodePart<{ alg: string; kid: string }>(jws.split('.')[0])
  if (!header) {
    steps.push({ label: 'Read the code', ok: false, detail: 'Not a signed credential' })
    return { ok: false, reason: 'This QR code is not a signed APAAR credential.', steps }
  }
  if (code.kind === 'token') steps.push({ label: 'Read the code', ok: true, detail: `${header.alg}, key ${header.kid}` })

  const registry = await issuerRegistry()
  const issuer = registry.find((i) => i.kid === header.kid)
  if (!issuer || issuer.status !== 'registered' || !issuer.jwk) {
    steps.push({ label: 'Issuer registry', ok: false, detail: 'Key not in the registry' })
    return { ok: false, reason: 'Not issued by a registered issuer.', steps }
  }
  steps.push({ label: 'Issuer registry', ok: true, detail: `${issuer.name}, registered` })

  let credential: Credential
  try {
    const { payload } = await compactVerify(jws, await importJWK(issuer.jwk, 'ES256'))
    credential = JSON.parse(new TextDecoder().decode(payload)) as Credential
  } catch {
    steps.push({ label: 'Signature check', ok: false, detail: 'ECDSA P-256 signature does not match' })
    return { ok: false, reason: 'The certificate was altered after it was issued, or was not issued by this university.', steps }
  }
  steps.push({ label: 'Signature check', ok: true, detail: 'ECDSA P-256 signature matches' })

  if (credential.vc.credentialStatus) {
    const revoked = await checkStatus(credential.vc.credentialStatus, registry)
    if (revoked === true) {
      steps.push({ label: 'Revocation list', ok: false, detail: 'Revoked by the issuer' })
      return { ok: false, reason: 'This certificate has been revoked by the university.', steps }
    }
    steps.push(revoked === false
      ? { label: 'Revocation list', ok: true, detail: 'Not revoked (W3C status list, signed)' }
      : { label: 'Revocation list', ok: true, detail: 'Could not be checked right now' })
  } else if (REVOKED_INDEXES.has(String(credential.vc.status))) {
    steps.push({ label: 'Revocation list', ok: false, detail: 'Revoked by the issuer' })
    return { ok: false, reason: 'This credential has been revoked by the issuer.', steps }
  } else {
    steps.push({ label: 'Revocation list', ok: true, detail: 'Not revoked' })
  }

  return { ok: true, issuer, credential, steps, certNo: credential.jti, source: code.kind }
}
