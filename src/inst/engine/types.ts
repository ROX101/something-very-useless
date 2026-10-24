export const COLUMNS = [
  'APAAR_ID',
  'INST_STUDENT_ID',
  'NAME',
  'DOB',
  'GENDER',
  'CATEGORY',
  'PROGRAMME',
  'QUOTA',
  'NRI',
  'OCI',
  'OCI_CARD_NO',
  'FN',
  'NATIONALITY',
  'ADMISSION_DATE',
  'APAAR_EXCEPTION',
] as const

export type Column = (typeof COLUMNS)[number]
export const OPTIONAL_COLUMNS: Column[] = ['APAAR_EXCEPTION']

export type UploadRow = { rowNo: number } & Record<Column, string>

export type Quota = 'REGULAR' | 'NRI' | 'NRI-CONVERTED' | 'FN-OCI-CIWG' | 'TFW' | 'PM-USPY'
export const EXCEPTION_CODES = ['CONSENT_REFUSED', 'FOREIGN_NATIONAL', 'GENERATION_PENDING'] as const

export interface Programme {
  code: string
  label: string
  name: string
  intake: number
}

export interface RegistryEntry {
  apaar: string
  name: string
  dob: string
  gender: string
}

export interface OtherEnrolment {
  apaar: string
  pid: string
  institution: string
  city: string
  ay: string
}

export type RuleCode =
  | 'R01' | 'R02' | 'R03' | 'R03a' | 'R04' | 'R04a'
  | 'R05' | 'R05a' | 'R06' | 'R07' | 'R08' | 'R09' | 'R10'

export type FlagKind = 'error' | 'alert' | 'auto'

export interface Fix {
  label: string
  remove?: boolean
  changes?: Partial<Record<Column, string>>
}

export interface Flag {
  rule: RuleCode
  kind: FlagKind
  field?: Column
  message: string
  alertId?: string
  fix?: Fix
}

export type RowStatus = 'clean' | 'action' | 'auto'

export interface RowResult {
  row: UploadRow
  flags: Flag[]
  status: RowStatus
}

export interface ComplianceAlert {
  id: string
  rule: RuleCode
  title: string
  detail: string
  clause: string
  rowNos: number[]
}

export interface Bucket {
  key: 'FN-OCI-CIWG' | 'TFW' | 'PM-USPY'
  label: string
  used: number
  cap: number
}

export interface LedgerLine {
  programme: Programme
  regular: number
  nri: number
  nriConverted: number
  excess: number
  buckets: Bucket[]
}

export interface ValidationResult {
  rows: RowResult[]
  counts: { total: number; clean: number; action: number; auto: number }
  byRule: Partial<Record<RuleCode, number>>
  alerts: ComplianceAlert[]
  dataErrors: number
  fixable: number
  ledger: LedgerLine[]
}
