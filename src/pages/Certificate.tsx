import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toCanvas } from 'html-to-image'
import { QrCode } from '../verify/QrCode'
import { Seal } from '../verify/Seal'
import { FORGED_JWS, GENUINE_JWS } from '../verify/credentials'
import { embed, fingerprint } from '../verify/stego'

const CERT_NO = 'GTU-2026-CSE-0417'

function Guilloche() {
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
  const micro = 'SAMPLE CERTIFICATE GODAVARI TECHNOLOGICAL UNIVERSITY GTU-2026-CSE-0417 '.repeat(30)
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

export default function Certificate() {
  const [params] = useSearchParams()
  const forged = params.get('forged') === '1'
  const cgpa = forged ? '9.42' : '8.42'
  const sheet = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)

  async function download() {
    if (!sheet.current) return
    setBusy(true)
    try {
      const canvas = await toCanvas(sheet.current, { pixelRatio: 2, cacheBust: false, backgroundColor: '#FFFDF8', style: { margin: '0', boxShadow: 'none' } })
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      embed(img, `${CERT_NO}|${await fingerprint(forged ? FORGED_JWS : GENUINE_JWS)}`)
      ctx.putImageData(img, 0, 0)
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'))
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${CERT_NO}${forged ? '-altered' : ''}.png`
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
          <Link to="/certificate/GTU-2026-CSE-0417" className={`rounded border px-3 py-1.5 font-semibold ${forged ? 'border-line bg-white text-ink' : 'border-navy bg-navy text-white'}`}>Original</Link>
          <Link to="/certificate/GTU-2026-CSE-0417?forged=1" className={`rounded border px-3 py-1.5 font-semibold ${forged ? 'border-navy bg-navy text-white' : 'border-line bg-white text-ink'}`}>Altered copy</Link>
        </div>
        <div className="flex gap-2">
          <button onClick={download} disabled={busy} className="rounded border border-navy bg-white px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50">{busy ? 'Preparing' : 'Download digital copy'}</button>
          <button onClick={() => window.print()} className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white">Print certificate</button>
        </div>
      </div>

      <article ref={sheet} className="relative mx-auto aspect-[297/210] w-full max-w-[1060px] overflow-hidden bg-[#FFFDF8] shadow-lg print:max-w-none print:shadow-none">
        <div className="absolute inset-4 border-[3px] border-[#5A1F2B]" />
        <div className="absolute inset-[22px] border border-[#C9A24A]" />
        <Guilloche />

        <div className="relative flex h-full flex-col items-center px-[7%] pb-[3.5%] pt-[5%] text-center">
          <Seal size={92} initials="GTU" top="GODAVARI TECHNOLOGICAL" bottom="UNIVERSITY  NASHIK" />
          <h1 className="mt-3 font-serif text-[clamp(20px,3.2vw,34px)] font-medium tracking-wide text-[#5A1F2B]">Godavari Technological University</h1>
          <p className="text-[clamp(11px,1.2vw,14px)] text-ink/70">Established under the Maharashtra State Universities Act</p>

          <p className="mt-[3%] font-serif text-[clamp(13px,1.6vw,18px)] italic text-ink/80">This is to certify that</p>
          <p className="mt-1 font-serif text-[clamp(24px,3.8vw,42px)] font-medium text-ink">Ritika Deshmukh</p>
          <p className="mt-1 text-[clamp(12px,1.4vw,16px)] text-ink/80">having fulfilled the requirements of the University has been awarded the degree of</p>
          <p className="mt-2 font-serif text-[clamp(16px,2.3vw,26px)] font-medium text-[#5A1F2B]">Bachelor of Technology</p>
          <p className="font-serif text-[clamp(13px,1.7vw,19px)] text-ink">in Computer Science & Engineering</p>
          <p className="mt-2 text-[clamp(12px,1.4vw,16px)] text-ink">
            with CGPA <strong className={forged ? 'text-ink' : ''}>{cgpa}</strong> in the First Class with Distinction, in the year 2026
          </p>

          <div className="mt-auto grid w-full grid-cols-[1fr_auto_1fr] items-end gap-6">
            <div className="text-left text-[clamp(10px,1.1vw,13px)] text-ink">
              <p><span className="text-ink/60">APAAR ID</span> <strong className="font-mono">4471 2093 6618</strong></p>
              <p><span className="text-ink/60">University Enrolment No.</span> <strong>GTU/2022/CSE/0417</strong></p>
              <p><span className="text-ink/60">Certificate No.</span> GTU-2026-CSE-0417</p>
              <p className="mt-3"><span className="text-ink/60">Nashik, 15 July 2026</span></p>
            </div>
            <div className="flex flex-col items-center">
              <div className="bg-white p-1.5 ring-1 ring-[#C9A24A]"><QrCode value={forged ? FORGED_JWS : GENUINE_JWS} size={150} label="Signed QR code" /></div>
              <p className="mt-1 text-[11px] font-semibold text-ink/80">Scan to verify</p>
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
