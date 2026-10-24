import type { RuleCode } from '../inst/engine/types'

export const AY = '2026-27'

export const BASE = {
  institutions: 13204,
  submitted: 9845,
  records: 2136905,
  apaarLinkedPct: 96.8,
  exceptionPct: 2.9,
  openAlerts: 1409,
  crossDuplicates: 4918,
}

export interface AlertRow {
  rowNo: number
  name: string
  studentId: string
  programme: string
  apaar: string
}

export interface AicteAlert {
  id: string
  institution: string
  pid: string
  city: string
  state: string
  rule: RuleCode
  title: string
  detail: string
  clause: string
  detected: string
  live?: boolean
  receiptNo?: string
  hash?: string
  rows?: AlertRow[]
  risk?: number
}

export const SAMPLE_ALERTS: AicteAlert[] = [
  { id: 'S-0932-R10', institution: 'Meghavarsha Institute of Technology', pid: '1-9000932', city: 'Bhopal', state: 'MP', rule: 'R10', title: '38 students enrolled at two institutions at once', detail: 'Shared with Trivikram (23), Ilavelir (14) and Aranya (1)', clause: '', detected: '2026-10-24T16:20:00+05:30', risk: 87 },
  { id: 'S-1105-R10', institution: 'Trivikram College of Engineering', pid: '1-9001105', city: 'Raipur', state: 'CG', rule: 'R10', title: '23 students also enrolled at Meghavarsha, Bhopal', detail: 'Same APAAR IDs, AY 2026-27', clause: '', detected: '2026-10-24T15:05:00+05:30', risk: 74 },
  { id: 'S-1247-R10', institution: 'Ilavelir Tech College', pid: '1-9001247', city: 'Coimbatore', state: 'TN', rule: 'R10', title: '14 students also enrolled at Meghavarsha, Bhopal', detail: 'Same APAAR IDs, AY 2026-27', clause: '', detected: '2026-10-24T13:40:00+05:30', risk: 69 },
  { id: 'S-2210-R06', institution: 'Kalpavriksha Polytechnic Institute', pid: '1-9002210', city: 'Indore', state: 'MP', rule: 'R06', title: 'Diploma Civil: 67 admitted against approved intake of 60', detail: '7 excess admissions', clause: '7.4(g)', detected: '2026-10-23T18:12:00+05:30', risk: 61 },
  { id: 'S-3381-R07', institution: 'Shravasti College of Management', pid: '1-9003381', city: 'Lucknow', state: 'UP', rule: 'R07', title: 'MBA: FN/OCI/CIWG 14 against a cap of 9', detail: '5 seats over the supernumerary cap', clause: '2.9', detected: '2026-10-23T11:30:00+05:30', risk: 58 },
  { id: 'S-4417-R06', institution: 'Hiranyaka Institute of Technology', pid: '1-9004417', city: 'Jaipur', state: 'RJ', rule: 'R06', title: 'B.Tech CSE: 186 admitted against approved intake of 180', detail: '6 excess admissions', clause: '7.4(g)', detected: '2026-10-22T17:45:00+05:30' },
  { id: 'S-5120-R07', institution: 'Neelaprabhu College of Engineering', pid: '1-9005120', city: 'Hyderabad', state: 'TS', rule: 'R07', title: 'B.Tech ECE: TFW 6 while regular seats are 41% filled', detail: 'TFW allowed only when at least 50% of intake is filled', clause: '6.42(d)(i)', detected: '2026-10-22T10:05:00+05:30' },
  { id: 'S-6075-R06', institution: 'Koshalvan Institute of Technology', pid: '1-9006075', city: 'Bilaspur', state: 'CG', rule: 'R06', title: 'B.Tech MECH: 63 admitted against approved intake of 60', detail: '3 excess admissions', clause: '7.4(g)', detected: '2026-10-21T14:22:00+05:30' },
  { id: 'S-6810-R05', institution: 'Suvarnamukhi Institute of Technology', pid: '1-9006810', city: 'Tirupati', state: 'AP', rule: 'R05', title: 'B.Tech CSE: 13 NRI seats against a limit of 9', detail: 'NRI seats are within the approved intake', clause: '2.8(b)', detected: '2026-10-21T09:48:00+05:30' },
  { id: 'S-7302-R06', institution: 'Rajnandini College of Pharmacy', pid: '1-9007302', city: 'Vadodara', state: 'GJ', rule: 'R06', title: 'B.Pharm: 104 admitted against approved intake of 100', detail: '4 excess admissions', clause: '7.4(g)', detected: '2026-10-20T16:30:00+05:30' },
  { id: 'S-7718-R07', institution: 'Indumati School of Management', pid: '1-9007718', city: 'Bengaluru', state: 'KA', rule: 'R07', title: 'PGDM: PM-USPY 4 against a cap of 2', detail: '2 seats over the supernumerary cap', clause: '6.43(b)', detected: '2026-10-20T12:10:00+05:30' },
  { id: 'S-8044-R06', institution: 'Ketakivan Polytechnic', pid: '1-9008044', city: 'Patna', state: 'BR', rule: 'R06', title: 'Diploma Electrical: 62 admitted against approved intake of 60', detail: '2 excess admissions', clause: '7.4(g)', detected: '2026-10-19T15:55:00+05:30' },
]

export const WATCHLIST = [
  { institution: 'Meghavarsha Institute of Technology', city: 'Bhopal', state: 'MP', risk: 87, reason: '38 cross-enrolled students' },
  { institution: 'Trivikram College of Engineering', city: 'Raipur', state: 'CG', risk: 74, reason: '23 cross-enrolled students' },
  { institution: 'Ilavelir Tech College', city: 'Coimbatore', state: 'TN', risk: 69, reason: '14 cross-enrolled students' },
  { institution: 'Kalpavriksha Polytechnic Institute', city: 'Indore', state: 'MP', risk: 61, reason: '7 excess admissions' },
  { institution: 'Shravasti College of Management', city: 'Lucknow', state: 'UP', risk: 58, reason: 'FN/OCI/CIWG over cap' },
]

export const RISK = {
  institution: 'Meghavarsha Institute of Technology',
  city: 'Bhopal',
  pid: '1-9000932',
  score: 87,
  factors: [
    { label: '38 students also enrolled at other institutions', points: 31 },
    { label: 'First-year intake up 64% on last year, peer median +6%', points: 22 },
    { label: '146 records edited after submission', points: 18 },
    { label: 'TFW seats 100% filled while regular seats are 52% filled', points: 16, clause: '6.42(d)(i)' },
  ],
}

export const RING = {
  nodes: [
    { id: 'M', name: 'Meghavarsha Institute of Technology', short: 'Meghavarsha', state: 'MP', place: 'Bhopal, MP', x: 330, y: 230, r: 46 },
    { id: 'T', name: 'Trivikram College of Engineering', short: 'Trivikram', state: 'CG', place: 'Raipur, CG', x: 640, y: 95, r: 34 },
    { id: 'I', name: 'Ilavelir Tech College', short: 'Ilavelir', state: 'TN', place: 'Coimbatore, TN', x: 640, y: 370, r: 30 },
    { id: 'A', name: 'Aranya Institute of Technology', short: 'Aranya', state: 'MH', place: 'Nashik, MH', x: 80, y: 230, r: 24 },
  ],
  edges: [
    { from: 'M', to: 'T', students: 23, probable: 5 },
    { from: 'M', to: 'I', students: 14, probable: 4 },
    { from: 'M', to: 'A', students: 1, probable: 0 },
  ],
}

export const STATE_NAME: Record<string, string> = {
  MP: 'Madhya Pradesh', CG: 'Chhattisgarh', TN: 'Tamil Nadu', UP: 'Uttar Pradesh', RJ: 'Rajasthan', TS: 'Telangana',
  AP: 'Andhra Pradesh', GJ: 'Gujarat', KA: 'Karnataka', BR: 'Bihar', MH: 'Maharashtra',
}
