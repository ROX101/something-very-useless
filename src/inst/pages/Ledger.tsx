import { Link } from 'react-router-dom'
import { InstLayout } from '../ui/InstLayout'
import { Card, ClauseChip, LockIcon, PageHeader, btn, maskApaar } from '../ui/bits'
import { useValidation } from '../store'
import { INSTITUTION } from '../data/reference'

const LINE = 80

export default function Ledger() {
  const result = useValidation()

  if (!result) {
    return (
      <InstLayout>
        <PageHeader title="Seat ledger" sub={`Admitted vs approved intake, AY ${INSTITUTION.ay}`} />
        <Card className="p-10 text-center">
          <p className="text-lg font-semibold text-ink">No admissions data yet</p>
          <p className="mt-1 text-sm text-muted">Upload the admissions file to build the seat ledger.</p>
          <Link to="/inst/upload" className={`${btn.primary} mt-5`}>Upload admissions</Link>
        </Card>
      </InstLayout>
    )
  }

  const totalRegular = result.ledger.reduce((n, l) => n + Math.min(l.regular, l.programme.intake), 0)
  const totalIntake = result.ledger.reduce((n, l) => n + l.programme.intake, 0)
  const totalSuper = result.ledger.reduce((n, l) => n + l.buckets.reduce((m, b) => m + b.used, 0), 0)
  const totalExcess = result.ledger.reduce((n, l) => n + l.excess, 0)
  const crossAlerts = result.alerts.filter((a) => a.rule === 'R10')
  const rowsByNo = new Map(result.rows.map((r) => [r.row.rowNo, r.row]))

  return (
    <InstLayout>
      <PageHeader title="Seat ledger" sub={`Admitted vs approved intake, AY ${INSTITUTION.ay}`}
        actions={<Link to="/inst/submit" className={btn.primary}>Continue to submit</Link>} />

      <div className="grid divide-y divide-line rounded border border-line bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-6 py-5">
          <p className="text-[0.9375rem] text-muted">Within approved intake</p>
          <p className="mt-1 text-[2rem] font-semibold leading-none tnum">{totalRegular} <span className="text-lg font-normal text-muted">/ {totalIntake}</span></p>
        </div>
        <div className="px-6 py-5">
          <p className="text-[0.9375rem] text-muted">Supernumerary seats</p>
          <p className="mt-1 text-[2rem] font-semibold leading-none tnum">{totalSuper}</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-[0.9375rem] text-muted">Excess admissions</p>
          <p className={`mt-1 text-[2rem] font-semibold leading-none tnum ${totalExcess ? 'text-err' : ''}`}>{totalExcess}</p>
        </div>
      </div>

      <Card className="mt-6 p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          <Legend className="bg-navy" label="Regular" />
          <Legend className="bg-[#8A8A8A]" label="NRI (within intake)" />
          <Legend className="bg-err" label="Excess" />
          <span className="flex items-center gap-2"><span className="h-4 border-l-2 border-dashed border-ink" />Approved intake</span>
        </div>

        <div className="space-y-7">
          {result.ledger.map((l, i) => {
            const within = Math.min(l.regular, l.programme.intake)
            const nriShare = Math.min(l.nri + l.nriConverted, within)
            const regW = ((within - nriShare) / l.programme.intake) * LINE
            const nriW = (nriShare / l.programme.intake) * LINE
            const delay = i * 120
            return (
              <div key={l.programme.code}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-ink">{l.programme.label}</p>
                  <p className="text-sm">
                    <span className={`text-lg font-semibold tabular-nums ${l.excess ? 'text-err' : 'text-ink'}`}>{l.regular}</span>
                    <span className="text-muted"> / {l.programme.intake}</span>
                    {l.excess > 0 && <span className="ml-2 font-semibold text-err">{l.excess} excess</span>}
                    {!l.excess && l.regular === l.programme.intake && <span className="ml-2 text-muted">Full</span>}
                  </p>
                </div>
                <div className="relative mt-2 h-8">
                  <div className="absolute inset-y-0 left-0 rounded bg-page" style={{ width: `${LINE}%` }} />
                  <div className="absolute inset-y-0 left-0 flex origin-left animate-[growX_.7s_cubic-bezier(.2,.8,.2,1)_both] overflow-hidden rounded-l"
                    style={{ width: `${regW + nriW}%`, animationDelay: `${delay}ms` }}>
                    <div className="h-full bg-navy" style={{ width: `${(regW / (regW + nriW || 1)) * 100}%` }} />
                    <div className="h-full bg-[#8A8A8A]" style={{ width: `${(nriW / (regW + nriW || 1)) * 100}%` }} />
                  </div>
                  <div className="absolute -inset-y-1.5 border-l-2 border-dashed border-ink" style={{ left: `${LINE}%` }} />
                  {l.excess > 0 && (
                    <div className="absolute inset-y-0 flex gap-1 pl-1.5" style={{ left: `${LINE}%` }}>
                      {Array.from({ length: l.excess }).map((_, k) => (
                        <span key={k} className="block h-full w-4 animate-[popIn_.45s_ease-out_both] rounded-sm bg-err"
                          style={{ animationDelay: `${delay + 900 + k * 150}ms` }} />
                      ))}
                    </div>
                  )}
                </div>
                <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                  <span>Supernumerary</span>
                  {l.buckets.map((b) => {
                    const over = b.used > b.cap
                    return (
                      <span key={b.key} className={over ? 'font-semibold text-err' : 'text-ink'}>
                        {b.label} <span className="tnum">{b.used}/{b.cap}</span>{over && ', over cap'}
                      </span>
                    )
                  })}
                </p>
              </div>
            )
          })}
        </div>

        <ul className="mt-6 space-y-1 border-t border-line pt-4 text-sm text-muted">
          <li>Approved intake excludes supernumerary seats. <ClauseChip clause="Def. 10" /></li>
          <li>Caps are computed from the intake: FN/OCI/CIWG 15% <ClauseChip clause="2.9" />, TFW 5% <ClauseChip clause="6.42(d)(i)" />, PM-USPY 2 per course <ClauseChip clause="6.43(b)" /></li>
        </ul>
      </Card>

      <div className="mt-6 space-y-3">
        {result.ledger.filter((l) => l.excess > 0).map((l) => (
          <div key={l.programme.code} className="border-l-4 border-err bg-white px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <p className="flex items-center gap-2 font-semibold text-err"><LockIcon /> {l.programme.label}: {l.excess} excess admission{l.excess > 1 ? 's' : ''}</p>
              <ClauseChip clause="7.4(g)" />
            </div>
            <p className="mt-1 text-[0.9375rem] text-ink">Excess admission is not allowed under any circumstances. This alert is shared with AICTE.</p>
            <p className="mt-1 text-sm text-muted">Liable to: up to 5× total course fee per excess admission (cl. 7.3(g)), indicative</p>
          </div>
        ))}
        {crossAlerts.map((a) => {
          const row = rowsByNo.get(a.rowNos[0])
          return (
            <div key={a.id} className="border-l-4 border-warn bg-white px-5 py-4">
              <p className="flex items-center gap-2 font-semibold text-warn"><LockIcon /> {a.title}</p>
              <p className="mt-1 text-[0.9375rem] text-ink">{a.detail}{row && <>, APAAR <span className="whitespace-nowrap font-mono">{maskApaar(row.APAAR_ID)}</span>, {row.NAME}</>}</p>
              <p className="mt-1 text-sm text-muted">Cross-institution check against the AICTE central repository</p>
            </div>
          )
        })}
      </div>
    </InstLayout>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return <span className="flex items-center gap-2"><span className={`h-3 w-3 rounded-sm ${className}`} />{label}</span>
}
