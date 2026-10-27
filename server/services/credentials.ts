import { gzipSync } from 'node:zlib'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { credentials, issuers } from '../db/schema'
import { next } from '../lib/counters'
import { keyReadable, rotateIssuerKey, signAs } from '../lib/signing'
import { PUBLIC, audit, type Who } from '../lib/audit'

const SYSTEM: Who = { ...PUBLIC, userId: 'system', name: 'APAAR-Sathi (system)' }
import { env } from '../env'

type Exec = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

/** W3C Bitstring Status List: at least 131,072 entries so a list does not reveal how many credentials exist. */
export const STATUS_LIST_SIZE = 131072
const CONTEXT = ['https://www.w3.org/ns/credentials/v2']

export const statusListUrl = (short: string) => `${env.publicUrl}/api/public/status/${short.toLowerCase()}`

export interface IssueInput {
  issuerDid: string
  apaar: string
  holderName: string
  studentId: string
  programmeCode: string
  degree: string
  year: number
  cgpa: string
  division: string
  institutionPid?: string | null
  issuedAt?: string
  certNo?: string
}

/**
 * Signs and stores a degree credential twice: the full one (with marks) and a public subset for the QR link.
 * Both carry the same credentialStatus entry, so revoking one revokes both.
 */
interface SignFields { certNo: string; statusIndex: number; issuedAt: string; apaar: string; studentId: string; holderName: string; degree: string; year: number; cgpa: string | null | undefined; division: string | null | undefined }

/** Both signed forms of a degree: the full record (with marks) and the public summary (without). */
async function signCredential(db: Exec, issuer: typeof issuers.$inferSelect, f: SignFields) {
  const nbf = Math.floor(new Date(f.issuedAt).getTime() / 1000)
  const credentialStatus = {
    id: `${statusListUrl(issuer.short)}#${f.statusIndex}`, type: 'BitstringStatusListEntry', statusPurpose: 'revocation',
    statusListIndex: String(f.statusIndex), statusListCredential: statusListUrl(issuer.short),
  }
  const base = { apaar: f.apaar, sid: f.studentId, name: f.holderName, degree: f.degree, year: f.year }
  const vc = (subject: Record<string, unknown>, kind: string) => ({
    iss: issuer.did, jti: f.certNo, nbf,
    vc: { '@context': CONTEXT, type: ['VerifiableCredential', 'DegreeCredential', kind], issuer: { id: issuer.did, name: issuer.name }, credentialSubject: subject, credentialStatus },
  })
  return {
    jws: await signAs(db, issuer.did, vc({ ...base, cgpa: f.cgpa, div: f.division }, 'FullRecord')),
    publicJws: await signAs(db, issuer.did, vc(base, 'PublicSummary')),
  }
}

/**
 * If SIGNING_KEY_SECRET changed after an issuer's key was stored, the key can't be read and nothing can be signed
 * (issuing, revocation lists). Boot repairs this: the issuer gets a new key and its certificates are re-signed.
 * Printed QR codes hold only a short link, so they keep working and fetch the re-signed record.
 */
export async function repairIssuerKeys(db: Db) {
  const repaired: string[] = []
  for (const issuer of await db.select().from(issuers)) {
    if (keyReadable(issuer.privateJwkEnc)) continue
    await db.transaction(async (tx) => {
      const fresh = await rotateIssuerKey(tx, issuer.did)
      const rows = await tx.select().from(credentials).where(eq(credentials.issuerDid, issuer.did))
      for (const c of rows) {
        if (c.statusIndex == null || !c.holderName || !c.studentId || !c.degree || c.year == null) continue
        const signed = await signCredential(tx, fresh, { certNo: c.certNo, statusIndex: c.statusIndex, issuedAt: c.issuedAt, apaar: c.apaar, studentId: c.studentId, holderName: c.holderName, degree: c.degree, year: c.year, cgpa: c.cgpa, division: c.division })
        await tx.update(credentials).set(signed).where(eq(credentials.certNo, c.certNo))
      }
      await audit(tx, SYSTEM, { category: 'System', action: 'Rotated issuer signing key', detail: `${issuer.name}: stored key unreadable with the current SIGNING_KEY_SECRET; new key ${fresh.kid}, ${rows.length} certificates re-signed`, entity: 'issuer', entityId: issuer.did })
    })
    repaired.push(issuer.short)
  }
  return repaired
}

export async function issueCredential(db: Exec, input: IssueInput, issuedBy: string) {
  const issuer = (await db.query.issuers.findFirst({ where: eq(issuers.did, input.issuerDid) }))!
  const index = await next(db, `status:${issuer.did}`, 1)
  const seq = await next(db, `cert:${issuer.did}:${input.year}:${input.programmeCode}`, 1)
  const certNo = input.certNo ?? `${issuer.short}-${input.year}-${input.programmeCode}-${String(seq).padStart(4, '0')}`
  const issuedAt = input.issuedAt ?? new Date().toISOString()
  const nbf = Math.floor(new Date(issuedAt).getTime() / 1000)
  const { jws, publicJws } = await signCredential(db, issuer, { certNo, statusIndex: index, issuedAt, apaar: input.apaar, studentId: input.studentId, holderName: input.holderName, degree: input.degree, year: input.year, cgpa: input.cgpa, division: input.division })

  const [row] = await db.insert(credentials).values({
    certNo, apaar: input.apaar, jws, publicJws, issuedAt, issuerDid: issuer.did, statusIndex: index,
    holderName: input.holderName, studentId: input.studentId, programmeCode: input.programmeCode, degree: input.degree,
    year: input.year, cgpa: input.cgpa, division: input.division, institutionPid: input.institutionPid ?? null, issuedBy,
  }).returning()
  return row
}

export async function revokeCredential(db: Exec, issuerDid: string, certNo: string, reason: string) {
  const [row] = await db.update(credentials)
    .set({ revoked: true, revokedReason: reason, revokedAt: new Date().toISOString() })
    .where(and(eq(credentials.certNo, certNo), eq(credentials.issuerDid, issuerDid)))
    .returning()
  return row ?? null
}

/** The issuer's signed revocation list (W3C Bitstring Status List v1.0, encodedList = multibase base64url GZIP bitstring). */
export async function statusListJws(db: Db, short: string) {
  const issuer = await db.query.issuers.findFirst({ where: eq(issuers.short, short.toUpperCase()) })
  if (!issuer) return null
  const revoked = await db.select({ i: credentials.statusIndex }).from(credentials)
    .where(and(eq(credentials.issuerDid, issuer.did), eq(credentials.revoked, true)))
  const bits = new Uint8Array(STATUS_LIST_SIZE / 8)
  for (const { i } of revoked) if (i != null) bits[i >> 3] |= 0x80 >> (i & 7)
  const encodedList = `u${gzipSync(bits).toString('base64url')}`
  return signAs(db, issuer.did, {
    iss: issuer.did, jti: statusListUrl(issuer.short), nbf: Math.floor(Date.now() / 1000),
    vc: {
      '@context': CONTEXT, type: ['VerifiableCredential', 'BitstringStatusListCredential'], issuer: { id: issuer.did, name: issuer.name },
      credentialSubject: { id: `${statusListUrl(issuer.short)}#list`, type: 'BitstringStatusList', statusPurpose: 'revocation', encodedList },
    },
  })
}
