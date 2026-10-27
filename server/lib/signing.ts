import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { CompactSign, exportJWK, generateKeyPair, importJWK, type JWK } from 'jose'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { issuers } from '../db/schema'
import { env } from '../env'

type Exec = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

// AES-256-GCM key derived from SIGNING_KEY_SECRET. Rotating that secret makes stored private keys unreadable,
// so in production it is set once and kept (or the keys move to an HSM).
const kek = () => createHash('sha256').update(`apaar-issuer-keys|${env.signingSecret}`).digest()

function encrypt(plain: string) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', kek(), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64url')).join('.')
}

function decrypt(sealed: string) {
  const [iv, tag, body] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'))
  const d = createDecipheriv('aes-256-gcm', kek(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(body), d.final()]).toString('utf8')
}

/** Registers a degree-awarding body with a fresh ES256 (ECDSA P-256) signing key. */
export async function createIssuer(db: Exec, input: { did: string; name: string; short: string; city?: string }) {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const kid = `${input.short.toLowerCase()}-${new Date().getFullYear()}-${randomBytes(3).toString('hex')}`
  const pub = await exportJWK(publicKey)
  const priv = await exportJWK(privateKey)
  const [row] = await db.insert(issuers).values({
    did: input.did, name: input.name, short: input.short, city: input.city ?? '', kid,
    publicJwk: pub as unknown as Record<string, string>, privateJwkEnc: encrypt(JSON.stringify(priv)),
  }).returning()
  return row
}

/** True when the stored private key can be read with the current SIGNING_KEY_SECRET. */
export function keyReadable(privateJwkEnc: string) {
  try { decrypt(privateJwkEnc); return true } catch { return false }
}

/** Gives an issuer a new key pair (new kid). Signatures made with the old key stop verifying. */
export async function rotateIssuerKey(db: Exec, did: string) {
  const issuer = await db.query.issuers.findFirst({ where: eq(issuers.did, did) })
  if (!issuer) throw new Error(`Unknown issuer ${did}`)
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const kid = `${issuer.short.toLowerCase()}-${new Date().getFullYear()}-${randomBytes(3).toString('hex')}`
  const [row] = await db.update(issuers).set({
    kid, publicJwk: (await exportJWK(publicKey)) as unknown as Record<string, string>,
    privateJwkEnc: encrypt(JSON.stringify(await exportJWK(privateKey))),
  }).where(eq(issuers.did, did)).returning()
  return row
}

/** Signs a JWT-VC payload with the issuer's key. */
export async function signAs(db: Exec, did: string, payload: Record<string, unknown>) {
  const issuer = await db.query.issuers.findFirst({ where: eq(issuers.did, did) })
  if (!issuer) throw new Error(`Unknown issuer ${did}`)
  if (issuer.status !== 'registered') throw new Error(`Issuer ${did} is ${issuer.status}`)
  const key = await importJWK(JSON.parse(decrypt(issuer.privateJwkEnc)) as JWK, 'ES256')
  return new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'ES256', kid: issuer.kid, typ: 'vc+jwt' })
    .sign(key)
}
