import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import jsQR from 'jsqr'
import { VerifierLayout } from '../VerifierLayout'
import { useApp } from '../../store'
import { PageTitle, Panel, btn, formatDate, maskApaar } from '../../inst/ui/bits'
import { readCode, verifyCredential, type VerifyResult } from '../../verify/crypto'
import { PURPOSES, activeConsent, useConsent, type SharedRecord } from '../../verify/consent'
import { fingerprint, inspect, mergeRegions, type StegoReport } from '../../verify/stego'
import { audit } from '../../audit/log'

interface Mark { report: StegoReport; url: string; width: number; height: number; code: string | null }

type Mode = 'camera' | 'image' | 'paste'

export default function Verify() {
  const [mode, setMode] = useState<Mode>('camera')
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [mark, setMark] = useState<Mark | null>(null)
  const [notice, setNotice] = useState('')

  async function check(code: string, m: Mark | null = null) {
    setBusy(true)
    setError('')
    setNotice('')
    setMark(m)
    const r = await verifyCredential(code)
    await new Promise((res) => setTimeout(res, 450))
    setResult(r)
    setBusy(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function reset() {
    setResult(null)
    setMark(null)
    setNotice('')
    setError('')
  }

  const showing = busy || Boolean(result) || Boolean(mark)

  return (
    <VerifierLayout>
      <PageTitle title="Verify a certificate" sub={showing ? 'Result of the scan' : 'Scan the QR code printed on a degree certificate'}
        actions={showing && !busy ? <button className={btn.primary} onClick={reset}>Scan another certificate</button> : undefined} />

      {!showing && (
        <Panel flush className="mx-auto max-w-4xl">
          <div className="flex gap-1 border-b border-line px-3" role="tablist">
            {([['camera', 'Camera'], ['image', 'Upload image'], ['paste', 'Paste code']] as [Mode, string][]).map(([m, l]) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError('') }}
                className={`-mb-px border-b-2 px-3 py-3 text-sm font-semibold ${mode === m ? 'border-navy text-navy' : 'border-transparent text-muted hover:text-ink'}`}>{l}</button>
            ))}
          </div>
          <div className="p-5">
            {mode === 'camera' && <Camera onCode={(c) => check(c)} onError={setError} paused={showing} />}
            {mode === 'image' && <ImageScan onScan={(c, m) => { if (c) check(c, m); else { setResult(null); setMark(m); setNotice('No QR code was found in this image. The hidden watermark was still checked.') } }} onError={setError} />}
            {mode === 'paste' && (
              <div>
                <label htmlFor="code" className="text-sm text-muted">Code from the QR</label>
                <textarea id="code" rows={6} value={text} onChange={(e) => setText(e.target.value)}
                  className="mt-1 w-full rounded border border-line p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-navy/30" />
                <button className={`${btn.primary} mt-3`} disabled={!text.trim() || busy} onClick={() => check(text)}>Verify</button>
              </div>
            )}
            {error && <p role="alert" className="mt-3 border-l-4 border-err bg-err-bg px-4 py-3 text-sm text-ink">{error}</p>}
          </div>
        </Panel>
      )}

      {showing && (
        <div className="mx-auto max-w-5xl">
          {busy && <Panel><p className="flex items-center gap-3 text-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-navy" aria-hidden />Checking the signature</p></Panel>}
          {!busy && notice && <p role="status" className="mb-6 border-l-4 border-warn bg-warn-bg px-4 py-3 text-[0.9375rem] text-ink">{notice}</p>}
          {!busy && result && <Result r={result} onReset={reset} />}
          {!busy && mark && <MarkPanel mark={mark} />}
        </div>
      )}
    </VerifierLayout>
  )
}

type CamState = 'idle' | 'starting' | 'on'

interface Detector { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }

function makeDetector(): Detector | null {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
  try {
    return BD ? new BD({ formats: ['qr_code'] }) : null
  } catch {
    return null
  }
}

function Camera({ onCode, onError, paused }: { onCode: (c: string) => void; onError: (e: string) => void; paused: boolean }) {
  const [state, setState] = useState<CamState>('idle')
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef(0)
  const done = useRef(onCode)
  done.current = onCode

  function stop() {
    window.clearTimeout(timer.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
    setState('idle')
  }

  useEffect(() => () => stop(), [])
  useEffect(() => { if (paused && state !== 'idle') stop() }, [paused, state])

  function explain(e: unknown) {
    const why = String((e as { name?: string })?.name ?? '') + ' ' + String(e)
    if (/NotAllowed|Permission/i.test(why)) onError('Camera access is blocked for this site. Tap the lock icon next to the address, allow Camera, then press Start camera again.')
    else if (/NotFound|Overconstrained/i.test(why)) onError('No camera was found on this device. Use Upload image instead.')
    else if (/NotReadable|in use/i.test(why)) onError('The camera is being used by another app. Close that app and press Start camera again.')
    else onError('The camera could not be opened. Use Upload image to take a photo instead.')
  }

  async function start() {
    onError('')
    if (!window.isSecureContext) {
      onError(`This page is open on ${window.location.origin}, which is not a secure address, so the browser blocks the camera. Open the https address instead, or use Upload image to take a photo.`)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onError('This browser does not give websites access to the camera. If the link opened inside another app, open it in Chrome or Safari instead, or use Upload image to take a photo.')
      return
    }
    setState('starting')
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      stream.current = s
      const v = video.current!
      v.srcObject = s
      await v.play()
      setState('on')
      scanLoop()
    } catch (e) {
      stop()
      explain(e)
    }
  }

  function scanLoop() {
    const detector = makeDetector()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const tick = async () => {
      const v = video.current
      if (!v || !stream.current) return
      if (v.readyState >= 2 && v.videoWidth) {
        let found: string | null = null
        if (detector) {
          try {
            const r = await detector.detect(v)
            found = r[0]?.rawValue ?? null
          } catch {
            found = null
          }
        }
        if (!found) {
          const scale = Math.min(1, 1280 / v.videoWidth)
          canvas.width = Math.round(v.videoWidth * scale)
          canvas.height = Math.round(v.videoHeight * scale)
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
          found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null
        }
        if (found) {
          stop()
          done.current(found)
          return
        }
      }
      timer.current = window.setTimeout(tick, 120)
    }
    tick()
  }

  return (
    <div>
      <div className={`relative overflow-hidden rounded bg-ink ${state === 'idle' ? 'hidden' : ''}`}>
        <video ref={video} playsInline muted autoPlay className="block aspect-[4/3] w-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="aspect-square w-[62%] max-w-[320px] rounded-md border-[3px] border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
        <p className="absolute inset-x-0 bottom-0 bg-ink/70 px-3 py-2 text-center text-sm text-white">
          {state === 'starting' ? 'Opening the camera' : 'Hold the QR code inside the square'}
        </p>
      </div>
      {state === 'idle' && (
        <div className="flex flex-col items-center justify-center rounded border-2 border-dashed border-line px-6 py-14 text-center">
          <svg className="h-10 w-10 text-navy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 12h8" /></svg>
          <p className="mt-3 font-semibold text-ink">Hold the certificate’s QR code up to the camera</p>
          <button className={`${btn.primary} mt-4`} onClick={start}>Start camera</button>
        </div>
      )}
      {state !== 'idle' && <button className={`${btn.secondary} mt-3`} onClick={stop}>Stop camera</button>}
    </div>
  )
}

function ImageScan({ onScan, onError }: { onScan: (code: string | null, mark: Mark) => void; onError: (e: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  async function scan(file: File) {
    onError('')
    let mark: Mark
    try {
      const bmp = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bmp.width
      canvas.height = bmp.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(bmp, 0, 0)
      const px = ctx.getImageData(0, 0, bmp.width, bmp.height)
      const found = jsQR(px.data, px.width, px.height)
      mark = { report: inspect(px), url: URL.createObjectURL(file), width: bmp.width, height: bmp.height, code: found?.data ?? null }
    } catch {
      onError('This image could not be opened. Use a PNG or JPG file.')
      return
    }
    if (mark.code) { onScan(mark.code, mark); return }
    try {
      const s = new Html5Qrcode('qr-file', { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } })
      const t = await s.scanFile(file, false)
      onScan(t, { ...mark, code: t })
    } catch {
      onScan(null, mark)
    }
  }
  return (
    <div>
      <div id="qr-file" className="hidden" />
      <button onClick={() => input.current?.click()}
        className="flex w-full flex-col items-center justify-center rounded border-2 border-dashed border-line px-6 py-14 text-center hover:border-navy/60">
        <p className="font-semibold text-ink">Choose a photo, scan or digital copy of the certificate</p>
        <p className="mt-1 text-sm text-muted">PNG or JPG. Digital copies are also checked for the hidden watermark.</p>
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" data-testid="qr-image"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) scan(f); e.target.value = '' }} />
    </div>
  )
}

function MarkPanel({ mark }: { mark: Mark }) {
  const { report } = mark
  const [match, setMatch] = useState<boolean | null>(null)
  const [certNo, fp] = (report.message ?? '').split('|')
  useEffect(() => {
    let live = true
    if (!report.message || !mark.code) { setMatch(null); return }
    // New certificates carry a link in the QR: the watermark must name the same certificate.
    // Older cards carry the signed token itself: compare its fingerprint.
    const code = readCode(mark.code)
    if (code?.kind === 'link') { setMatch(code.certNo === certNo); return }
    fingerprint(mark.code).then((f) => { if (live) setMatch(f === fp) })
    return () => { live = false }
  }, [report.message, mark.code, fp, certNo])

  const noMark = !report.message && report.edited.length > report.blocks * 0.5
  const regions = mergeRegions(report.edited)
  const edited = report.message && report.edited.length > 0

  const head = noMark
    ? { tone: 'border-l-line bg-page', title: 'No hidden watermark', text: 'Printed, photographed or re-saved copies do not carry it. The QR signature is the check for these.' }
    : edited
      ? { tone: 'border-l-err bg-err-bg', title: 'Edited after issue', text: `${regions.length} area${regions.length === 1 ? '' : 's'} of the image changed after the university issued it.` }
      : match === false
        ? { tone: 'border-l-err bg-err-bg', title: 'Watermark does not match the QR', text: 'The hidden watermark belongs to a different certificate.' }
        : { tone: 'border-l-ok bg-ok-bg', title: 'Hidden watermark intact', text: 'No part of the image has been changed since it was issued.' }

  return (
    <section className="mt-6 rounded border border-line bg-white">
      <div className={`border-b border-line border-l-4 px-5 py-4 ${head.tone}`}>
        <p className="text-sm text-muted">Digital copy check</p>
        <p className="text-xl font-semibold text-ink">{head.title}</p>
        <p className="text-ink">{head.text}</p>
      </div>
      {!noMark && (
        <dl className="grid gap-x-8 gap-y-3 border-b border-line px-5 py-4 text-[0.9375rem] sm:grid-cols-3">
          <div><dt className="text-sm text-muted">Certificate in watermark</dt><dd className="font-medium">{certNo || 'Unreadable'}</dd></div>
          <div><dt className="text-sm text-muted">Matches QR signature</dt><dd className="font-medium">{match === null ? 'QR not read' : match ? 'Yes' : 'No'}</dd></div>
          <div><dt className="text-sm text-muted">Areas checked</dt><dd className="font-medium tnum">{report.blocks.toLocaleString('en-IN')}, {report.edited.length} changed</dd></div>
        </dl>
      )}
      {edited && (
        <div className="px-5 py-4">
          <div className="relative overflow-hidden rounded border border-line">
            <img src={mark.url} alt="Uploaded certificate with edited areas marked" className="block w-full" />
            {regions.map((r, i) => (
              <span key={i} className="absolute animate-[fadeIn_.4s_ease-out_both] border-2 border-err bg-err/15"
                style={{ left: `${(r.x / mark.width) * 100}%`, top: `${(r.y / mark.height) * 100}%`, width: `${(r.w / mark.width) * 100}%`, height: `${(r.h / mark.height) * 100}%`, animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">Red boxes show where the pixels no longer match the university’s hidden watermark.</p>
        </div>
      )}
      <p className="border-t border-line px-5 py-3 text-sm text-muted">Invisible watermark woven into the pixels of the issued digital copy, with a keyed check for every 16 × 16 pixel area.</p>
    </section>
  )
}

function Result({ r, onReset }: { r: VerifyResult; onReset: () => void }) {
  const { requests, request, view } = useConsent()
  const apaar = r.ok ? r.credential.vc.credentialSubject.apaar : ''
  const org = useApp((st) => st.account?.org ?? '')
  const consent = r.ok ? activeConsent(requests, apaar, org) : undefined
  const waiting = r.ok && !consent && requests.some((x) => x.apaar === apaar && x.verifierOrg === org && x.status === 'Pending')
  const [purposeId, setPurposeId] = useState<string>(PURPOSES[0].id)
  const [reference, setReference] = useState('')
  const [wantMarks, setWantMarks] = useState(false)
  const purpose = PURPOSES.find((p) => p.id === purposeId)!
  const [shared, setShared] = useState<SharedRecord | null>(null)
  const [askErr, setAskErr] = useState('')
  const viewedFor = useRef<string | null>(null)
  const scanned = useRef(false)

  // The signature is checked in the browser, so the browser reports the result to the audit trail.
  useEffect(() => {
    if (scanned.current) return
    scanned.current = true
    audit('Verification', r.ok ? 'Verified certificate' : 'Rejected certificate', r.ok ? `${r.credential.vc.credentialSubject.sid}, signature valid, issued by ${r.issuer.name}` : r.reason)
  }, [r])

  // The server checks consent again and writes the read to the student's access log.
  useEffect(() => {
    if (!r.ok || !consent) { setShared(null); viewedFor.current = null; return }
    if (viewedFor.current === consent.consentNo) return
    viewedFor.current = consent.consentNo ?? null
    view(apaar).then(setShared)
  }, [r, consent, apaar, view])

  async function ask() {
    setAskErr('')
    if (reference.trim().length < 4) { setAskErr(`Enter the ${purpose.reference.toLowerCase()}.`); return }
    try {
      await request({ apaar, purpose: purpose.label, reference: `${purpose.reference.replace(' number', '')} ${reference.trim()}`, validityDays: 7, retentionDays: 30, fields: wantMarks ? ['basic', 'marks'] : ['basic'] })
    } catch (e) {
      setAskErr((e as Error).message)
    }
  }

  const head = !r.ok
    ? { tone: 'border-l-err bg-err-bg', title: 'Signature invalid', text: r.reason, cls: 'animate-[shake_.35s_ease-in-out]' }
    : consent
      ? { tone: 'border-l-ok bg-ok-bg', title: 'Verified', text: `Issued by ${r.issuer.name}`, cls: '' }
      : { tone: 'border-l-ok bg-ok-bg', title: 'Genuine certificate', text: `Signed by ${r.issuer.name}. For marks or a logged verification record, ask the student.`, cls: '' }

  return (
    <section className={`rounded border border-line bg-white ${head.cls}`}>
      <div className={`border-b border-line border-l-4 px-5 py-4 ${head.tone}`}>
        <p className="text-2xl font-semibold text-ink">{head.title}</p>
        <p className="text-ink">{head.text}</p>
      </div>

      {r.ok && (
        <dl className="grid gap-x-8 gap-y-3 border-b border-line px-5 py-4 text-[0.9375rem] sm:grid-cols-2">
          <div><dt className="text-sm text-muted">Name</dt><dd className="font-semibold">{r.credential.vc.credentialSubject.name}</dd></div>
          <div><dt className="text-sm text-muted">Degree</dt><dd>{r.credential.vc.credentialSubject.degree}</dd></div>
          <div><dt className="text-sm text-muted">Year of award</dt><dd>{r.credential.vc.credentialSubject.year}</dd></div>
          <div><dt className="text-sm text-muted">Certificate number</dt><dd className="font-mono">{r.certNo}</dd></div>
          <div><dt className="text-sm text-muted">APAAR ID</dt><dd className="font-mono">{maskApaar(apaar)}</dd></div>
          {consent && <div><dt className="text-sm text-muted">Award status (live record)</dt><dd className={shared?.status === 'Revoked' ? 'font-semibold text-err' : ''}>{shared?.status ?? 'Checking…'}</dd></div>}
          {consent && shared?.fields.includes('marks') && <>
            <div><dt className="text-sm text-muted">CGPA</dt><dd className="font-semibold">{shared.cgpa}</dd></div>
            <div><dt className="text-sm text-muted">Division</dt><dd>{shared.division}</dd></div>
          </>}
          {consent && <div className="sm:col-span-2"><dt className="text-sm text-muted">Student consent</dt><dd>{consent.consentNo}, until {formatDate(consent.expiresAt!)}{shared && !shared.fields.includes('marks') ? '. Marks were not part of this consent.' : ''}</dd></div>}
          <p className="text-sm text-muted sm:col-span-2">Compare these with the document in front of you. Category, address and date of birth are never shared.</p>
        </dl>
      )}

      {r.ok && !consent && (
        <div className="border-b border-line px-5 py-4">
          {waiting
            ? <p className="text-ink">Request sent. Waiting for the student to allow or refuse.</p>
            : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-muted">Purpose
                  <select value={purposeId} onChange={(e) => setPurposeId(e.target.value)} className="mt-1 h-11 w-full rounded border border-line bg-white px-3 text-[0.9375rem]">
                    {PURPOSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                <label className="text-sm text-muted">{purpose.reference}
                  <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={`For example ${purpose.example}`} className="mt-1 h-11 w-full rounded border border-line bg-white px-3 font-mono text-[0.9375rem]" />
                </label>
                <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
                  <input type="checkbox" checked={wantMarks} onChange={(e) => setWantMarks(e.target.checked)} className="h-4 w-4 accent-navy" />
                  Also ask to see marks (CGPA and division). The student can see that you asked.
                </label>
                <div className="sm:col-span-2"><button className={btn.primary} onClick={ask}>Ask the student for consent</button></div>
              </div>
            )}
          {askErr && <p role="alert" className="mt-2 text-sm text-err">{askErr}</p>}
        </div>
      )}

      <ol className="space-y-2 px-5 py-4">
        {r.steps.map((s) => (
          <li key={s.label} className="flex items-start gap-3 text-[0.9375rem]">
            <span className={`mt-0.5 font-semibold ${s.ok ? 'text-ok' : 'text-err'}`} aria-label={s.ok ? 'passed' : 'failed'}>{s.ok ? '✓' : '✗'}</span>
            <span><span className="font-medium text-ink">{s.label}</span><span className="text-muted">, {s.detail}</span></span>
          </li>
        ))}
        {r.ok && (
          <li className="flex items-start gap-3 text-[0.9375rem]">
            <span className={`mt-0.5 font-semibold ${consent ? 'text-ok' : 'text-warn'}`}>{consent ? '✓' : '…'}</span>
            <span><span className="font-medium text-ink">Student consent</span><span className="text-muted">, {consent ? `${consent.consentNo} active` : 'not given yet'}</span></span>
          </li>
        )}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        <p className="text-sm text-muted">W3C Verifiable Credentials 2.0, JWS ES256 (ECDSA P-256), W3C Bitstring Status List</p>
        <button className={btn.link} onClick={onReset}>Scan another certificate</button>
      </div>
    </section>
  )
}
