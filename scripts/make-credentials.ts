import { CompactSign, exportJWK, generateKeyPair } from 'jose'
import { writeFileSync } from 'node:fs'

const KID = 'gtu-2026-01'

const payload = {
  iss: 'did:web:godavaritu.edu.in',
  jti: 'GTU-2026-CSE-0417',
  nbf: 1784073600,
  vc: {
    type: ['VerifiableCredential', 'DegreeCredential'],
    credentialSubject: {
      apaar: '447120936618',
      sid: 'GTU/2022/CSE/0417',
      name: 'Ritika Deshmukh',
      degree: 'B.Tech, Computer Science & Engineering',
      year: 2026,
      cgpa: '8.42',
      div: 'First Class with Distinction',
    },
    status: 417,
  },
}

const b64 = (s: string) => Buffer.from(s).toString('base64url')

const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
const genuine = await new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
  .setProtectedHeader({ alg: 'ES256', kid: KID, typ: 'vc+jwt' })
  .sign(privateKey)

const [header, , signature] = genuine.split('.')
const altered = { ...payload, vc: { ...payload.vc, credentialSubject: { ...payload.vc.credentialSubject, cgpa: '9.42' } } }
const forged = `${header}.${b64(JSON.stringify(altered))}.${signature}`

const publicJwk = await exportJWK(publicKey)

writeFileSync('src/verify/credentials.ts', `export const ISSUER_KEY = ${JSON.stringify({ kid: KID, ...publicJwk }, null, 2)} as const

export const GENUINE_JWS = '${genuine}'

export const FORGED_JWS = '${forged}'
`)
console.log('credentials written', genuine.length, forged.length)
