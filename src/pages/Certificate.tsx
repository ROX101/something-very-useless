import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toCanvas } from 'html-to-image'
import { QrCode } from '../verify/QrCode'
import { Seal } from '../verify/Seal'
import { api, ApiError } from '../api'
import { formatApaar } from '../inst/ui/bits'
import { embed, fingerprint } from '../verify/stego'

function Guilloche({ certNo, issuer }: { certNo: string; issuer: string }) {
  let seed = 417
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  const waves = Array.from({ length: 22 }, (_, k) => {
    const phase = rnd() * Math.PI * 2
    const amp = 6 + k * 0.9
    const pts: string[] = []
    for (let x = 0; x <= 297; x += 1.5) {
      const y = 105 + amp * Math.sin(x / 11 + phase) * Math.cos(x / 37 - k / 4)
      pts.push(`${x.toFixed(1)},${y.toFixed(2)}`)
    }
    return pts.join(' ')
  })
  const rosette = Array.from({ length: 36 }, (_, k) => {
    const a = (k / 36) * Math.PI * 2
    return { cx: 148.5 + Math.cos(a) * 9, cy: 105 + Math.sin(a) * 9 }
  })
  const micro = `${issuer.toUpperCase()} ${certNo} `.repeat(30)
  return (
    <svg aria-hidden viewBox="0 0 297 210" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      <g fill="none" stroke="#5A1F2B" strokeWidth="0.12" opacity="0.13">
        {waves.map((p, i) => <polyline key={i} points={p} />)}
      </g>
      <g fill="none" stroke="#C9A24A" strokeWidth="0.12" opacity="0.35">
        {rosette.map((c, i) => <ellipse key={i} cx={c.cx} cy={c.cy} rx="34" ry="22" transform={`rotate(${i * 5} ${c.cx} ${c.cy})`} />)}
      </g>
      <path id="micro-path" d="M 5.3 5.3 H 291.7 V 204.7 H 5.3 Z" fill="none" />
      <text fontSize="0.95" fill="#5A1F2B" fontFamily="IBM Plex Sans, sans-serif" letterSpacing="0.05">
        <textPath href="#micro-path">{micro}</textPath>
      </text>
    </svg>
  )
}

interface Doc {
  certNo: string; apaar: string; holderName: string; studentId: string; programmeCode: string; degree: string; year: number
  cgpa: string; division: string; issuedAt: string; revoked: boolean; revokedReason: string | null
  issuer: { did: string; name: string; short: string; city: string } | null
  jws: string; verifyPath: string
}

const DEGREES: Record<string, string> = {
  'B.Tech': 'Bachelor of Technology', 'B.E.': 'Bachelor of Engineering', 'M.Tech': 'Master of Technology', 'M.E.': 'Master of Engineering',
  MBA: 'Master of Business Administration', PGDM: 'Post Graduate Diploma in Management', MCA: 'Master of Computer Applications',
  'B.Pharm': 'Bachelor of Pharmacy', 'B.Arch': 'Bachelor of Architecture', Diploma: 'Diploma',
}

/** "B.Tech, Computer Science & Engineering" → ["Bachelor of Technology", "in Computer Science & Engineering"] */
function splitDegree(d: string): [string, string] {
  const [head, ...rest] = d.split(',').map((x) => x.trim())
  return [DEGREES[head] ?? head, rest.length ? `in ${rest.join(', ')}` : '']
}

export default function Certificate() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const forged = params.get('forged') === '1'
  const sheet = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [err, setErr] = useState<{ status: number; message: string } | null>(null)

  useEffect(() => {
    document.title = `${id} · APAAR`
    api.get<Doc>(`/credentials/${encodeURIComponent(id)}`).then(setDoc)
      .catch((e) => setErr({ status: e instanceof ApiError ? e.status : 0, message: (e as Error).message }))
  }, [id])

  if (err || !doc) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page p-4">
        <div className="max-w-lg rounded border border-line bg-white p-6 text-center">
          {!err ? <p className="text-muted">Loading certificate {id}…</p> : (
            <>
              <p className="text-lg font-semibold text-ink">{err.status === 401 ? 'Sign in to open this certificate' : err.status === 404 ? 'No such certificate' : 'You cannot open this certificate'}</p>
              <p className="mt-2 text-sm text-muted">The printable certificate, with marks, opens for the student, the issuing university and AICTE. Anyone can check that it is genuine from its public page.</p>
              <div className="mt-5 flex justify-center gap-3">
                {err.status === 401 && <Link to="/" state={{ from: `/certificate/${id}` }} className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white">Sign in</Link>}
                {err.status !== 404 && <Link to={`/c/${id}`} className="rounded border border-navy px-4 py-2 text-sm font-semibold text-navy">Check it is genuine</Link>}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  const issuerName = doc.issuer?.name ?? 'Issuing university'
  const short = doc.issuer?.short ?? ''
  const cgpa = forged ? (Math.min(10, Number(doc.cgpa) + 1)).toFixed(2) : doc.cgpa
  const verifyUrl = `${window.location.origin}${doc.verifyPath}`
  const [degreeTitle, degreeIn] = splitDegree(doc.degree)
  const issued = new Date(doc.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })

  async function download() {
    if (!sheet.current || !doc) return
    setBusy(true)
    try {
      const canvas = await toCanvas(sheet.current, { pixelRatio: 2, cacheBust: false, backgroundColor: '#FFFDF8', style: { margin: '0', boxShadow: 'none' } })
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      // The hidden watermark names the certificate and fingerprints its full signed record.
      embed(img, `${doc.certNo}|${await fingerprint(doc.jws)}`)
      ctx.putImageData(img, 0, 0)
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'))
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${doc.certNo}${forged ? '-altered' : ''}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-page py-8 print:bg-white print:py-0">
      <style>{'@page { size: A4 landscape; margin: 0; }'}</style>
      <div className="no-print mx-auto mb-5 flex max-w-[1060px] flex-wrap items-center justify-between gap-3 px-4">
        <div className="flex gap-2 text-sm">
          <Link to={`/certificate/${doc.certNo}`} className={`rounded border px-3 py-1.5 font-semibold ${forged ? 'border-line bg-white text-ink' : 'border-navy bg-navy text-white'}`}>Original</Link>
          <Link to={`/certificate/${doc.certNo}?forged=1`} className={`rounded border px-3 py-1.5 font-semibold ${forged ? 'border-navy bg-navy text-white' : 'border-line bg-white text-ink'}`}>Altered copy (demo)</Link>
        </div>
        <div className="flex gap-2">
          <button onClick={download} disabled={busy} className="rounded border border-navy bg-white px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50">{busy ? 'Preparing' : 'Download digital copy'}</button>
          <button onClick={() => window.print()} className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white">Print certificate</button>
        </div>
      </div>
      {doc.revoked && (
        <p role="alert" className="no-print mx-auto mb-4 max-w-[1060px] rounded border-l-4 border-err bg-err-bg px-4 py-3 text-sm text-err">
          Revoked by the university{doc.revokedReason ? `: ${doc.revokedReason}` : ''}. The QR now verifies as revoked.
        </p>
      )}
      {forged && (
        <p className="no-print mx-auto mb-4 max-w-[1060px] rounded border-l-4 border-warn bg-warn-bg px-4 py-3 text-sm text-ink">
          Demo of a forged paper copy: the printed CGPA was changed to {cgpa}. Its QR still opens the genuine record, and a verifier with the student’s consent sees the real CGPA ({doc.cgpa}). A downloaded digital copy edited this way fails the hidden watermark check.
        </p>
      )}

      <article ref={sheet} className="relative mx-auto aspect-[297/210] w-full max-w-[1060px] overflow-hidden bg-[#FFFDF8] shadow-lg print:max-w-none print:shadow-none">
        <div className="absolute inset-4 border-[3px] border-[#5A1F2B]" />
        <div className="absolute inset-[22px] border border-[#C9A24A]" />
        <Guilloche certNo={doc.certNo} issuer={issuerName} />

        <div className="relative flex h-full flex-col items-center px-[7%] pb-[3.5%] pt-[5%] text-center">
          <Seal size={92} initials={short} top={issuerName.split(' ').slice(0, -1).join(' ').toUpperCase() || issuerName.toUpperCase()} bottom={`${issuerName.split(' ').slice(-1)[0].toUpperCase()}  ${(doc.issuer?.city ?? '').toUpperCase()}`} />
          <h1 className="mt-3 font-serif text-[clamp(20px,3.2vw,34px)] font-medium tracking-wide text-[#5A1F2B]">{issuerName}</h1>
          <p className="text-[clamp(11px,1.2vw,14px)] text-ink/70">Degree-awarding body registered on APAAR-Sathi</p>

          <p className="mt-[3%] font-serif text-[clamp(13px,1.6vw,18px)] italic text-ink/80">This is to certify that</p>
          <p className="mt-1 font-serif text-[clamp(24px,3.8vw,42px)] font-medium text-ink">{doc.holderName}</p>
          <p className="mt-1 text-[clamp(12px,1.4vw,16px)] text-ink/80">having fulfilled the requirements of the University has been awarded the degree of</p>
          <p className="mt-2 font-serif text-[clamp(16px,2.3vw,26px)] font-medium text-[#5A1F2B]">{degreeTitle}</p>
          {degreeIn && <p className="font-serif text-[clamp(13px,1.7vw,19px)] text-ink">{degreeIn}</p>}
          <p className="mt-2 text-[clamp(12px,1.4vw,16px)] text-ink">
            with CGPA <strong>{cgpa}</strong> in the {doc.division}, in the year {doc.year}
          </p>

          <div className="mt-auto grid w-full grid-cols-[1fr_auto_1fr] items-end gap-6">
            <div className="text-left text-[clamp(10px,1.1vw,13px)] text-ink">
              <p><span className="text-ink/60">APAAR ID</span> <strong className="font-mono">{formatApaar(doc.apaar)}</strong></p>
              <p><span className="text-ink/60">University Student ID</span> <strong>{doc.studentId}</strong></p>
              <p><span className="text-ink/60">Certificate No.</span> {doc.certNo}</p>
              <p className="mt-3"><span className="text-ink/60">{doc.issuer?.city ? `${doc.issuer.city}, ` : ''}{issued}</span></p>
            </div>
            <div className="flex flex-col items-center">
              <div className="bg-white p-1.5 ring-1 ring-[#C9A24A]"><QrCode value={verifyUrl} size={130} label={`QR code linking to ${verifyUrl}`} /></div>
              <p className="mt-1 text-[0.75rem] font-semibold text-ink/80">Scan to verify</p>
            </div>
            <div className="flex justify-end gap-8 text-[clamp(10px,1.1vw,13px)] text-ink">
              <div className="text-center"><div className="mb-1 h-8 w-28 border-b border-ink/50" /><p>Registrar</p></div>
              <div className="text-center"><div className="mb-1 h-8 w-28 border-b border-ink/50" /><p>Vice-Chancellor</p></div>
            </div>
          </div>
        </div>
      </article>
    </div>
  )
}
