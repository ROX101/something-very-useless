import { gzipSync } from 'node:zlib'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { credentials, issuers } from '../db/schema'
import { next } from '../lib/counters'
import { signAs } from '../lib/signing'
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
export async function issueCredential(db: Exec, input: IssueInput, issuedBy: string) {
  const issuer = (await db.query.issuers.findFirst({ where: eq(issuers.did, input.issuerDid) }))!
  const index = await next(db, `status:${issuer.did}`, 1)
  const seq = await next(db, `cert:${issuer.did}:${input.year}:${input.programmeCode}`, 1)
  const certNo = input.certNo ?? `${issuer.short}-${input.year}-${input.programmeCode}-${String(seq).padStart(4, '0')}`
  const issuedAt = input.issuedAt ?? new Date().toISOString()
  const nbf = Math.floor(new Date(issuedAt).getTime() / 1000)
  const credentialStatus = {
    id: `${statusListUrl(issuer.short)}#${index}`, type: 'BitstringStatusListEntry', statusPurpose: 'revocation',
    statusListIndex: String(index), statusListCredential: statusListUrl(issuer.short),
  }
  const base = { apaar: input.apaar, sid: input.studentId, name: input.holderName, degree: input.degree, year: input.year }
  const vc = (subject: Record<string, unknown>, kind: string) => ({
    iss: issuer.did, jti: certNo, nbf,
    vc: { '@context': CONTEXT, type: ['VerifiableCredential', 'DegreeCredential', kind], issuer: { id: issuer.did, name: issuer.name }, credentialSubject: subject, credentialStatus },
  })
  const jws = await signAs(db, issuer.did, vc({ ...base, cgpa: input.cgpa, div: input.division }, 'FullRecord'))
  const publicJws = await signAs(db, issuer.did, vc(base, 'PublicSummary'))

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
