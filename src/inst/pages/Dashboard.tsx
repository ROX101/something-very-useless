import { Link } from 'react-router-dom'
import { InstLayout } from '../ui/InstLayout'
import { Clause, LockIcon, Notice, Panel, btn, daysUntil, formatDate, td, th } from '../ui/bits'
import { useInst, useValidation } from '../store'
import { DEADLINE, INSTITUTION, PROGRAMMES, caps } from '../data/reference'
import { Crest } from '../ui/Crest'
import { useApp } from '../../store'

export default function Dashboard() {
  const account = useApp((s) => s.account)!
  const result = useValidation()
  const submissions = useInst((s) => s.submissions)
  const latest = submissions[0]
  const days = daysUntil(DEADLINE)

  const status = latest
    ? { text: 'Submitted', tone: 'text-ok' }
    : !result
      ? { text: 'Not started', tone: 'text-ink' }
      : result.dataErrors > 0
        ? { text: 'Errors to fix', tone: 'text-err' }
        : { text: 'Ready to submit', tone: 'text-navy' }

  const next = latest
    ? { to: '/inst/submit', label: 'View receipt' }
    : !result
      ? { to: '/inst/upload', label: 'Upload admissions' }
      : result.dataErrors > 0
        ? { to: '/inst/upload', label: 'Resolve data errors' }
        : { to: '/inst/submit', label: 'Review and submit' }

  const ledger = new Map(result?.ledger.map((l) => [l.programme.code, l]) ?? [])

  return (
    <InstLayout>
      <section className="mb-6 flex flex-col gap-6 rounded border border-line bg-white p-6 sm:flex-row sm:items-center">
        <Crest size={104} />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[30px] font-medium leading-tight text-ink">{INSTITUTION.name}</h1>
          <p className="mt-1 text-[15px] text-muted">{INSTITUTION.city}, {INSTITUTION.state}. Welcome, {account.name}</p>
          <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="AICTE permanent ID">{INSTITUTION.pid}</Fact>
            <Fact label="Established">{INSTITUTION.established}</Fact>
            <Fact label="Affiliated to">{INSTITUTION.university}</Fact>
            <Fact label="Approval status"><span className="font-semibold text-ok">{INSTITUTION.approval}</span></Fact>
          </dl>
        </div>
      </section>

      <div className="space-y-6">
        {latest ? (
          <Notice tone="ok">
            <strong>Enrolment data submitted, {formatDate(latest.submittedAt)}</strong> <span className="ml-2 font-mono text-sm">Receipt {latest.receiptNo}</span>
          </Notice>
        ) : (
          <Notice tone="deadline">
            <strong>Enrolment upload due 29 Nov 2026, {days} day{days === 1 ? '' : 's'} left</strong> <span className="ml-2"><Clause clause="2.25(n)" /></span>
          </Notice>
        )}

        <Panel title="Submission status" actions={<Link to={next.to} className={btn.primary}>{next.label}</Link>} flush>
          <dl className="divide-y divide-line">
            <Row label="Submission status"><span className={`font-semibold ${status.tone}`}>{status.text}</span></Row>
            <Row label="Student records"><span className="tnum">{result ? result.counts.total.toLocaleString('en-IN') : '0'}</span></Row>
            <Row label="Data errors"><span className={`tnum ${result?.dataErrors ? 'font-semibold text-err' : ''}`}>{result ? result.dataErrors : 0}</span></Row>
            <Row label="Compliance alerts"><span className={`tnum ${result?.alerts.length ? 'font-semibold text-warn' : ''}`}>{result ? result.alerts.length : 0}</span></Row>
          </dl>
        </Panel>

        <Panel title="Programmes, approved intake" flush>
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead className="border-b border-line bg-page/60">
                <tr>
                  <th className={th}>Programme</th>
                  <th className={`${th} text-right`}>Approved intake</th>
                  <th className={`${th} text-right`}>Admitted</th>
                  <th className={th}>Supernumerary caps</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {PROGRAMMES.map((p) => {
                  const l = ledger.get(p.code)
                  const c = caps(p.intake)
                  const vacant = l ? p.intake - l.regular : 0
                  return (
                    <tr key={p.code}>
                      <td className={td}>
                        <p className="font-semibold">{p.label}</p>
                        <p className="text-sm text-muted">{p.name}</p>
                      </td>
                      <td className={`${td} text-right tnum`}>{p.intake}</td>
                      <td className={`${td} text-right tnum ${l?.excess ? 'font-semibold text-err' : ''}`}>{l ? l.regular : '–'}</td>
                      <td className={`${td} text-sm text-muted`}>FN/OCI/CIWG {c.fnOciCiwg}, TFW {c.tfw}, PM-USPY {c.pmUspy}</td>
                      <td className={td}>
                        {!l ? <span className="text-muted">–</span>
                          : l.excess ? <span className="font-semibold text-err">{l.excess} over intake</span>
                            : vacant > 0 ? <span>{vacant} vacant</span>
                              : <span>Full</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {result && result.alerts.length > 0 && (
          <Panel title={<span className="flex items-center gap-2 text-warn"><LockIcon />Compliance alerts visible to AICTE</span>} actions={<Link to="/inst/ledger" className={btn.link}>View seat ledger</Link>} flush>
            <ul className="divide-y divide-line">
              {result.alerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span>{a.title}</span>
                  <Clause clause={a.clause} />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </InstLayout>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3 sm:grid-cols-[240px_1fr]">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
