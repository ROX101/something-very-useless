import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PublicLayout } from '../ui/PublicLayout'
import { formatApaar, btn } from '../inst/ui/bits'
import { verifyCredential, type VerifyResult } from '../verify/crypto'

/**
 * What a phone camera opens when it scans the QR on a certificate: /c/<certificate number>.
 * No sign-in. Checks the issuer's signature and revocation in the browser and shows only the public summary.
 */
export default function PublicVerify() {
  const { certNo = '' } = useParams()
  const [r, setR] = useState<VerifyResult | null>(null)

  useEffect(() => {
    document.title = `Verify ${certNo} · APAAR`
    setR(null)
    void verifyCredential(`/c/${certNo}`).then(setR)
  }, [certNo])

  const s = r?.ok ? r.credential.vc.credentialSubject : null
  return (
    <PublicLayout crumb="Verify a certificate">
      <section className="mx-auto max-w-3xl rounded border border-line bg-white">
        {!r && <p className="flex items-center gap-3 px-6 py-8 text-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-navy" aria-hidden />Checking certificate {certNo}</p>}
        {r && (
          <>
            <div className={`border-b border-line border-l-4 px-6 py-5 ${r.ok ? 'border-l-ok bg-ok-bg' : 'border-l-err bg-err-bg'}`}>
              <p className="text-2xl font-semibold text-ink">{r.ok ? 'Genuine certificate' : 'Not verified'}</p>
              <p className="text-ink">{r.ok ? `Issued and signed by ${r.issuer.name}` : r.reason}</p>
            </div>
            {s && (
              <dl className="grid gap-x-8 gap-y-3 border-b border-line px-6 py-5 text-[0.9375rem] sm:grid-cols-2">
                <div><dt className="text-sm text-muted">Name</dt><dd className="font-semibold">{s.name}</dd></div>
                <div><dt className="text-sm text-muted">APAAR ID</dt><dd className="font-mono">{formatApaar(s.apaar)}</dd></div>
                <div><dt className="text-sm text-muted">Degree</dt><dd>{s.degree}</dd></div>
                <div><dt className="text-sm text-muted">Year of award</dt><dd>{s.year}</dd></div>
                <div><dt className="text-sm text-muted">University student ID</dt><dd>{s.sid}</dd></div>
                <div><dt className="text-sm text-muted">Certificate number</dt><dd className="font-mono">{r.ok && r.certNo}</dd></div>
                <p className="text-sm text-muted sm:col-span-2">Compare these details with the paper or PDF in front of you. Marks are not shown here: an employer or institution can ask the student to share them, and the student decides.</p>
              </dl>
            )}
            <ol className="space-y-2 px-6 py-5">
              {r.steps.map((st) => (
                <li key={st.label} className="flex items-start gap-3 text-[0.9375rem]">
                  <span className={`mt-0.5 font-semibold ${st.ok ? 'text-ok' : 'text-err'}`} aria-label={st.ok ? 'passed' : 'failed'}>{st.ok ? '✓' : '✗'}</span>
                  <span><span className="font-medium text-ink">{st.label}</span><span className="text-muted">, {st.detail}</span></span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
              <p className="text-sm text-muted">W3C Verifiable Credentials, ES256 signature, W3C Bitstring Status List for revocation</p>
              <Link to="/" className={btn.secondary}>Registered verifier? Sign in</Link>
            </div>
          </>
        )}
      </section>
    </PublicLayout>
  )
}
