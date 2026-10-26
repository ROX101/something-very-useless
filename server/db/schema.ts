import {
  bigserial, boolean, char, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar,
} from 'drizzle-orm/pg-core'
import type { ComplianceAlert, UploadRow } from '../../src/inst/engine/types'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' })

export const institutions = pgTable('institutions', {
  pid: varchar('pid', { length: 20 }).primaryKey(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  state: char('state', { length: 2 }).notNull(),
  university: text('university'),
  type: text('type'),
  initials: varchar('initials', { length: 8 }),
  established: integer('established'),
  approval: text('approval'),
  motto: text('motto'),
  /** The university (degree-awarding body) this institution is affiliated to; null for autonomous bodies not yet onboarded. */
  awardingDid: text('awarding_did'),
})

/**
 * Degree-awarding bodies registered as credential issuers. The private signing key is stored encrypted
 * (AES-256-GCM with SIGNING_KEY_SECRET); in production this would live in an HSM.
 */
export const issuers = pgTable('issuers', {
  did: text('did').primaryKey(),
  name: text('name').notNull(),
  short: varchar('short', { length: 12 }).notNull(),
  city: text('city').notNull().default(''),
  kid: varchar('kid', { length: 40 }).notNull().unique(),
  publicJwk: jsonb('public_jwk').$type<Record<string, string>>().notNull(),
  privateJwkEnc: text('private_jwk_enc').notNull(),
  status: varchar('status', { length: 12 }).notNull().default('registered'),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const programmes = pgTable('programmes', {
  institutionPid: varchar('institution_pid', { length: 20 }).notNull().references(() => institutions.pid, { onDelete: 'cascade' }),
  code: varchar('code', { length: 16 }).notNull(),
  label: text('label').notNull(),
  name: text('name').notNull(),
  intake: integer('intake').notNull(),
  /** First-year admissions last academic year, from AICTE approval data. Used for year-on-year anomaly checks. */
  lastYearAdmitted: integer('last_year_admitted'),
}, (t) => [primaryKey({ columns: [t.institutionPid, t.code] })])

export const users = pgTable('users', {
  userId: text('user_id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: varchar('role', { length: 24 }).notNull(),
  org: text('org').notNull(),
  scope: text('scope').notNull(),
  institutionPid: varchar('institution_pid', { length: 20 }).references(() => institutions.pid),
  apaar: char('apaar', { length: 12 }),
  states: text('states').array().notNull().default([]),
  /** For university registrars: the issuer they act for. */
  issuerDid: text('issuer_did'),
  /** Registered mobile for one-time passwords (students). */
  mobile: varchar('mobile', { length: 10 }),
  /** Accounts created from a registration start with a one-time password that must be changed. */
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastLoginAt: ts('last_login_at'),
})

export const apaarRegistry = pgTable('apaar_registry', {
  apaar: char('apaar', { length: 12 }).primaryKey(),
  name: text('name').notNull(),
  dob: date('dob', { mode: 'string' }).notNull(),
  gender: char('gender', { length: 1 }).notNull(),
})

/**
 * The national enrolment register: one row per student per institution per academic year, from submissions.
 * apaar is null for students with an exception code (they can still be matched by name + DOB).
 */
export const enrolments = pgTable('enrolments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  apaar: char('apaar', { length: 12 }),
  institutionPid: varchar('institution_pid', { length: 20 }).notNull(),
  institution: text('institution').notNull(),
  city: text('city').notNull(),
  ay: varchar('ay', { length: 7 }).notNull(),
  programme: text('programme'),
  submissionReceipt: text('submission_receipt'),
  instStudentId: text('inst_student_id'),
  name: text('name'),
  /** Normalised name used for probable-duplicate matching. */
  nameKey: text('name_key'),
  dob: date('dob', { mode: 'string' }),
  gender: char('gender', { length: 1 }),
  category: varchar('category', { length: 12 }),
  quota: varchar('quota', { length: 16 }),
  /** active | withdrawn | transferred */
  status: varchar('status', { length: 12 }).notNull().default('active'),
  statusDate: date('status_date', { mode: 'string' }),
  statusNote: text('status_note'),
}, (t) => [
  index('enrolments_apaar_idx').on(t.apaar),
  index('enrolments_person_idx').on(t.nameKey, t.dob),
  uniqueIndex('enrolments_unique').on(t.apaar, t.institutionPid, t.ay),
])

export const uploads = pgTable('uploads', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  institutionPid: varchar('institution_pid', { length: 20 }).notNull().references(() => institutions.pid),
  fileName: text('file_name').notNull(),
  uploadedBy: text('uploaded_by').notNull().references(() => users.userId),
  uploadedAt: ts('uploaded_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  fixesApplied: integer('fixes_applied').notNull().default(0),
  rows: jsonb('rows').$type<UploadRow[]>().notNull(),
  current: boolean('current').notNull().default(true),
}, (t) => [index('uploads_inst_current_idx').on(t.institutionPid, t.current)])

export interface SubmissionSnapshot {
  counts: { total: number; clean: number; action: number; auto: number }
  excess: number
  alerts: ComplianceAlert[]
  /** Older snapshots carry only the first five fields. */
  rows: (Pick<UploadRow, 'rowNo' | 'NAME' | 'INST_STUDENT_ID' | 'PROGRAMME' | 'APAAR_ID'> & Partial<Pick<UploadRow, 'DOB' | 'GENDER' | 'CATEGORY' | 'QUOTA' | 'NRI' | 'OCI' | 'FN' | 'NATIONALITY' | 'ADMISSION_DATE' | 'APAAR_EXCEPTION'>>)[]
}

export const submissions = pgTable('submissions', {
  receiptNo: text('receipt_no').primaryKey(),
  institutionPid: varchar('institution_pid', { length: 20 }).notNull().references(() => institutions.pid),
  uploadId: integer('upload_id').notNull().references(() => uploads.id),
  ay: varchar('ay', { length: 7 }).notNull(),
  submittedAt: ts('submitted_at').notNull().defaultNow(),
  submittedBy: text('submitted_by').notNull(),
  fileName: text('file_name').notNull(),
  records: integer('records').notNull(),
  alerts: integer('alerts').notNull(),
  hash: char('hash', { length: 64 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('Received'),
  snapshot: jsonb('snapshot').$type<SubmissionSnapshot>().notNull(),
}, (t) => [index('submissions_inst_idx').on(t.institutionPid, t.submittedAt)])

export const complianceAlerts = pgTable('compliance_alerts', {
  id: text('id').primaryKey(),
  institutionPid: varchar('institution_pid', { length: 20 }).notNull(),
  institution: text('institution').notNull(),
  city: text('city').notNull(),
  state: char('state', { length: 2 }).notNull(),
  rule: varchar('rule', { length: 4 }).notNull(),
  clause: text('clause').notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  detectedAt: ts('detected_at').notNull(),
  receiptNo: text('receipt_no').references(() => submissions.receiptNo, { onDelete: 'cascade' }),
  rows: jsonb('rows').$type<{ rowNo: number; name: string; studentId: string; programme: string; apaar: string }[]>().notNull().default([]),
  live: boolean('live').notNull().default(false),
  risk: integer('risk'),
}, (t) => [index('alerts_state_idx').on(t.state), index('alerts_rule_idx').on(t.rule)])

export const alertActions = pgTable('alert_actions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  alertId: text('alert_id').notNull(),
  status: varchar('status', { length: 40 }).notNull(),
  note: text('note').notNull().default(''),
  by: text('by').notNull(),
  at: ts('at').notNull().defaultNow(),
}, (t) => [index('alert_actions_alert_idx').on(t.alertId, t.at)])

export const verificationRequests = pgTable('verification_requests', {
  id: text('id').primaryKey(),
  apaar: char('apaar', { length: 12 }).notNull(),
  verifierUserId: text('verifier_user_id').references(() => users.userId),
  verifier: text('verifier').notNull(),
  verifierOrg: text('verifier_org').notNull(),
  purpose: text('purpose').notNull(),
  reference: text('reference').notNull().default(''),
  validityDays: integer('validity_days').notNull(),
  retentionDays: integer('retention_days').notNull().default(30),
  /** What the verifier asks to see: 'basic' (name, degree, year, status) and optionally 'marks' (CGPA, division). */
  fields: text('fields').array().notNull().default(['basic']),
  /** DPDP Act s.8(7): the verifier must erase the data when consent is withdrawn or the retention period ends. */
  firstViewedAt: ts('first_viewed_at'),
  eraseBy: ts('erase_by'),
  erasedAt: ts('erased_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  status: varchar('status', { length: 12 }).notNull().default('Pending'),
  decidedAt: ts('decided_at'),
  consentNo: text('consent_no'),
  expiresAt: ts('expires_at'),
}, (t) => [index('vr_apaar_idx').on(t.apaar), index('vr_org_idx').on(t.verifierOrg)])

export const accessLog = pgTable('access_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  apaar: char('apaar', { length: 12 }).notNull(),
  at: ts('at').notNull().defaultNow(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
}, (t) => [index('access_log_apaar_idx').on(t.apaar, t.at)])

/**
 * Hash-chained audit trail. hash = SHA-256 of seq|at|actorName|roleLabel|org|category|action|detail|prevHash,
 * the same format the browser's Audit Trail page re-checks. actor/role/entity/entityId are for filtering only.
 */
export const auditLog = pgTable('audit_log', {
  seq: bigserial('seq', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull().defaultNow(),
  actor: text('actor').notNull(),
  role: varchar('role', { length: 24 }).notNull(),
  actorName: text('actor_name').notNull().default(''),
  roleLabel: text('role_label').notNull().default(''),
  org: text('org').notNull().default(''),
  category: varchar('category', { length: 24 }).notNull().default('System'),
  action: text('action').notNull(),
  detail: text('detail').notNull().default(''),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  prevHash: char('prev_hash', { length: 64 }).notNull(),
  hash: char('hash', { length: 64 }).notNull(),
})

/**
 * Issued credentials. jws is the full signed credential (with marks) for the holder, the issuer and consented
 * verifiers; publicJws is a signed subset (no marks) that anyone holding the certificate can check via the QR link.
 */
export const credentials = pgTable('credentials', {
  certNo: text('cert_no').primaryKey(),
  apaar: char('apaar', { length: 12 }).notNull(),
  jws: text('jws').notNull(),
  publicJws: text('public_jws'),
  issuedAt: ts('issued_at').notNull().defaultNow(),
  revoked: boolean('revoked').notNull().default(false),
  revokedReason: text('revoked_reason'),
  revokedAt: ts('revoked_at'),
  issuerDid: text('issuer_did'),
  statusIndex: integer('status_index'),
  holderName: text('holder_name'),
  studentId: text('student_id'),
  programmeCode: varchar('programme_code', { length: 16 }),
  degree: text('degree'),
  year: integer('year'),
  cgpa: varchar('cgpa', { length: 8 }),
  division: text('division'),
  institutionPid: varchar('institution_pid', { length: 20 }),
  issuedBy: text('issued_by'),
}, (t) => [uniqueIndex('credentials_status_idx').on(t.issuerDid, t.statusIndex)])

/** Sign-up requests from the public Register page, reviewed by AICTE before an account is created. */
export const registrations = pgTable('registrations', {
  ref: text('ref').primaryKey(),
  kind: varchar('kind', { length: 8 }).notNull(),
  apaar: char('apaar', { length: 12 }),
  mobile: varchar('mobile', { length: 10 }),
  org: text('org'),
  email: text('email'),
  purpose: text('purpose'),
  status: varchar('status', { length: 12 }).notNull().default('Received'),
  createdAt: ts('created_at').notNull().defaultNow(),
  decidedAt: ts('decided_at'),
  decidedBy: text('decided_by'),
  decisionNote: text('decision_note'),
  /** The account created on approval. */
  userId: text('user_id'),
})

/** One-time passwords. Only a hash is stored; codes expire after 5 minutes and allow 5 attempts. */
export const otps = pgTable('otps', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: text('user_id').notNull(),
  purpose: text('purpose').notNull(),
  codeHash: char('code_hash', { length: 64 }).notNull(),
  expiresAt: ts('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  usedAt: ts('used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('otps_user_idx').on(t.userId, t.purpose)])

/**
 * Statutory access by a regulator to one institution's records, without student consent (as NAD allows for
 * statutory and investigating bodies), but only with a recorded legal basis, for a limited time, and logged.
 */
export const statutoryAccess = pgTable('statutory_access', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.userId),
  org: text('org').notNull(),
  institutionPid: varchar('institution_pid', { length: 20 }).notNull().references(() => institutions.pid),
  basis: text('basis').notNull(),
  reference: text('reference').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
  notifiedAt: ts('notified_at'),
})

/**
 * Machine-to-machine keys. scope 'institution' keys act for one institution (ERP integration);
 * scope 'aicte' keys are for AICTE systems (approved-intake import). Only a SHA-256 of the secret is stored.
 */
export const apiKeys = pgTable('api_keys', {
  id: varchar('id', { length: 24 }).primaryKey(),
  scope: varchar('scope', { length: 12 }).notNull(),
  institutionPid: varchar('institution_pid', { length: 20 }).references(() => institutions.pid),
  name: text('name').notNull(),
  secretHash: char('secret_hash', { length: 64 }).notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastUsedAt: ts('last_used_at'),
  revokedAt: ts('revoked_at'),
})

/** Replays the stored response when a client retries a request with the same Idempotency-Key. */
export const idempotency = pgTable('idempotency', {
  key: text('key').notNull(),
  apiKeyId: varchar('api_key_id', { length: 24 }).notNull(),
  status: integer('status').notNull(),
  response: jsonb('response').$type<unknown>().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.apiKeyId, t.key] })])

export const counters = pgTable('counters', {
  name: text('name').primaryKey(),
  value: integer('value').notNull(),
})
