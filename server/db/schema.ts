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
})

export const programmes = pgTable('programmes', {
  institutionPid: varchar('institution_pid', { length: 20 }).notNull().references(() => institutions.pid, { onDelete: 'cascade' }),
  code: varchar('code', { length: 16 }).notNull(),
  label: text('label').notNull(),
  name: text('name').notNull(),
  intake: integer('intake').notNull(),
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

export const enrolments = pgTable('enrolments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  apaar: char('apaar', { length: 12 }).notNull(),
  institutionPid: varchar('institution_pid', { length: 20 }).notNull(),
  institution: text('institution').notNull(),
  city: text('city').notNull(),
  ay: varchar('ay', { length: 7 }).notNull(),
  programme: text('programme'),
  submissionReceipt: text('submission_receipt'),
}, (t) => [
  index('enrolments_apaar_idx').on(t.apaar),
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
  rows: Pick<UploadRow, 'rowNo' | 'NAME' | 'INST_STUDENT_ID' | 'PROGRAMME' | 'APAAR_ID'>[]
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
  validityDays: integer('validity_days').notNull(),
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

export const auditLog = pgTable('audit_log', {
  seq: bigserial('seq', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull().defaultNow(),
  actor: text('actor').notNull(),
  role: varchar('role', { length: 24 }).notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  prevHash: char('prev_hash', { length: 64 }).notNull(),
  hash: char('hash', { length: 64 }).notNull(),
})

export const credentials = pgTable('credentials', {
  certNo: text('cert_no').primaryKey(),
  apaar: char('apaar', { length: 12 }).notNull(),
  jws: text('jws').notNull(),
  issuedAt: ts('issued_at').notNull().defaultNow(),
  revoked: boolean('revoked').notNull().default(false),
  revokedReason: text('revoked_reason'),
})

export const counters = pgTable('counters', {
  name: text('name').primaryKey(),
  value: integer('value').notNull(),
})
