export type Role =
  | 'aicte_bureau'
  | 'aicte_regional'
  | 'aicte_admin'
  | 'inst_admin'
  | 'inst_operator'
  | 'student'
  | 'verifier'
  | 'university'
  | 'regulator'

export interface Account {
  userId: string
  name: string
  role: Role
  org: string
  scope: string
  /** Set on accounts created from a registration until the one-time password is changed. */
  mustChangePassword?: boolean
}

export const AICTE_DOMAIN = 'aicte-india.org'
export const AICTE_ROLES: Role[] = ['aicte_bureau', 'aicte_regional', 'aicte_admin']

export const ROLE_LABEL: Record<Role, string> = {
  aicte_bureau: 'Regulation Bureau Officer',
  aicte_regional: 'Regional Officer',
  aicte_admin: 'AICTE Administrator',
  inst_admin: 'Institution Admin (Nodal Officer)',
  inst_operator: 'Data Operator',
  student: 'Student',
  verifier: 'Registered Verifier',
  university: 'University Registrar (Degree-awarding body)',
  regulator: 'Regulatory Body Officer',
}

export const ROLE_HOME: Record<Role, string> = {
  aicte_bureau: '/aicte',
  aicte_regional: '/aicte',
  aicte_admin: '/aicte/admin',
  inst_admin: '/inst',
  inst_operator: '/inst',
  student: '/student',
  verifier: '/verify',
  university: '/university',
  regulator: '/regulator',
}

export const DEMO_PASSWORD = 'Demo@2026'

export const ACCOUNTS: Account[] = [
  { userId: 'meena.iyer@aicte-india.org', name: 'Meena Iyer', role: 'aicte_bureau',
    org: 'AICTE Regulation Bureau', scope: 'All India' },
  { userId: 'rahul.kulkarni@aicte-india.org', name: 'Rahul Kulkarni', role: 'aicte_regional',
    org: 'AICTE Western Regional Office', scope: 'Maharashtra, Goa' },
  { userId: 'sysadmin@aicte-india.org', name: 'AICTE IT Cell', role: 'aicte_admin',
    org: 'AICTE IT Cell', scope: 'Users, roles, rule-pack deploys' },
  { userId: 'nodal@aranya-tech.edu.in', name: 'Dr. Sunanda Patil', role: 'inst_admin',
    org: 'Aranya Institute of Technology, Nashik', scope: 'PID 1-9000417' },
  { userId: 'operator@aranya-tech.edu.in', name: 'Nikhil Bhosale', role: 'inst_operator',
    org: 'Aranya Institute of Technology, Nashik', scope: 'PID 1-9000417, upload only' },
  { userId: 'nodal@meghavarsha-tech.edu.in', name: 'Dr. Alok Saxena', role: 'inst_admin',
    org: 'Meghavarsha Institute of Technology, Bhopal', scope: 'PID 1-9000932' },
  { userId: '447120936618', name: 'Ritika Deshmukh', role: 'student',
    org: 'APAAR 4471 2093 6618', scope: 'Own records' },
  { userId: 'kabir.menon@tarangsoftware.in', name: 'Kabir Menon', role: 'verifier',
    org: 'Tarang Software Pvt. Ltd.', scope: 'Consented verifications' },
  { userId: 'registrar@godavaritu.edu.in', name: 'Dr. Anjali Kulkarni', role: 'university',
    org: 'Godavari Technological University', scope: 'Affiliated institutions, degree issuance' },
  { userId: 'assessor@naac.gov.in', name: 'Prof. R. Venkatesh', role: 'regulator',
    org: 'National Assessment and Accreditation Council (NAAC)', scope: 'Statutory access, logged' },
]

export function normaliseUserId(raw: string): string {
  const s = raw.trim().toLowerCase()
  const digits = s.replace(/\s+/g, '')
  return /^\d{12}$/.test(digits) ? digits : s
}

export function domainOf(userId: string): string | null {
  const at = userId.lastIndexOf('@')
  return at === -1 ? null : userId.slice(at + 1)
}

export type SignInResult =
  | { ok: true; account: Account }
  | { ok: false; error: 'not_found' | 'bad_password' | 'domain_policy' }

export function signIn(rawUserId: string, password: string): SignInResult {
  const userId = normaliseUserId(rawUserId)
  const account = ACCOUNTS.find((a) => a.userId === userId)
  if (!account) return { ok: false, error: 'not_found' }
  if (password !== DEMO_PASSWORD) return { ok: false, error: 'bad_password' }
  const isAicteDomain = domainOf(userId) === AICTE_DOMAIN
  const isAicteRole = AICTE_ROLES.includes(account.role)
  if (isAicteDomain !== isAicteRole) return { ok: false, error: 'domain_policy' }
  return { ok: true, account }
}

export function canAccess(role: Role, allowed: Role[]): boolean {
  return allowed.includes(role)
}
