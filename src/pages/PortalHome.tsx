import { PortalShell } from '../ui/PortalShell'
import { useApp } from '../store'
import { ROLE_LABEL, type Role } from '../auth/directory'

interface Module { title: string; body: string }

const MODULES: Record<Role, { headline: string; modules: Module[] }> = {
  university: { headline: 'Degree-awarding body', modules: [{ title: 'Students', body: 'Verified APAAR IDs of students at affiliated institutions.' }, { title: 'Credentials', body: 'Issue and revoke signed degree certificates.' }] },
  regulator: { headline: 'Statutory access', modules: [{ title: 'Institution records', body: 'Look up an institution\'s submitted students under a recorded legal basis.' }] },
  aicte_bureau: {
    headline: 'National monitoring',
    modules: [
      { title: 'National dashboard', body: 'Submissions, APAAR coverage and compliance alerts across all states.' },
      { title: 'Duplicate rings & risk', body: 'Students enrolled at two institutions at once, with explainable risk scores.' },
      { title: 'Cases', body: 'Open a case and refer an institution to its Regional Office.' },
      { title: 'Reports', body: 'Policy and accreditation exports (NIRF, AISHE, NBA).' },
    ],
  },
  aicte_regional: {
    headline: 'Regional oversight',
    modules: [
      { title: 'Region dashboard', body: 'Institutions and alerts in your region only.' },
      { title: 'Referred cases', body: 'Cases referred by the Regulation Bureau for field verification.' },
      { title: 'Field findings', body: 'Record inspection findings and a recommendation.' },
    ],
  },
  aicte_admin: {
    headline: 'System administration',
    modules: [
      { title: 'Users & roles', body: 'Create AICTE accounts and assign roles. @aicte-india.org only.' },
      { title: 'Rule packs', body: 'Deploy approved, year-versioned APH rule packs.' },
      { title: 'Issuer registry', body: 'Technical checks on university signing keys.' },
    ],
  },
  inst_admin: {
    headline: 'Enrolment submission, AY 2026-27',
    modules: [
      { title: 'Upload admissions', body: 'Excel or ERP API, checked through 6 validation gates.' },
      { title: 'Seat ledger', body: 'Admitted vs approved intake, with supernumerary caps.' },
      { title: 'Submit to AICTE', body: 'Nodal-officer sign-off with affidavit and a hashed receipt.' },
      { title: 'Operators', body: 'Add or remove data operators for your institution.' },
    ],
  },
  inst_operator: {
    headline: 'Enrolment data entry, AY 2026-27',
    modules: [
      { title: 'Upload admissions', body: 'Excel or ERP API, checked through 6 validation gates.' },
      { title: 'Fix data errors', body: 'Correct flagged rows and add APAAR exception codes.' },
    ],
  },
  student: {
    headline: 'Your academic record',
    modules: [
      { title: 'Verification requests', body: 'Approve or refuse each employer request.' },
      { title: 'Access log', body: 'See who viewed your data, and when.' },
      { title: 'My credentials', body: 'Your degree with its signed QR code.' },
    ],
  },
  verifier: {
    headline: 'Credential verification',
    modules: [
      { title: 'Scan certificate', body: 'Scan the QR on a certificate to check its signature.' },
      { title: 'Consented requests', body: 'Request a student’s consent to verify their degree.' },
    ],
  },
}

export default function PortalHome() {
  const account = useApp((s) => s.account)!
  const cfg = MODULES[account.role]
  return (
    <PortalShell>
      <p className="text-sm font-semibold text-navy">{ROLE_LABEL[account.role]}</p>
      <h1 className="mt-1 text-3xl font-semibold text-ink">Welcome, {account.name}</h1>
      <p className="mt-1 text-muted">{cfg.headline}</p>

      <div className="mt-6 grid gap-4 rounded border border-line bg-white p-5 sm:grid-cols-3">
        <div><p className="text-xs text-muted">Signed in as</p><p className="mt-0.5 break-all font-medium text-ink">{account.userId}</p></div>
        <div><p className="text-xs text-muted">Organisation</p><p className="mt-0.5 font-medium text-ink">{account.org}</p></div>
        <div><p className="text-xs text-muted">Access scope</p><p className="mt-0.5 font-medium text-ink">{account.scope}</p></div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {cfg.modules.map((m) => (
          <div key={m.title} className="rounded border border-line bg-white p-5">
            <h2 className="text-lg font-semibold text-ink">{m.title}</h2>
            <p className="mt-2 text-sm text-muted">{m.body}</p>
          </div>
        ))}
      </div>
    </PortalShell>
  )
}
