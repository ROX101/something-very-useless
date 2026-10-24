import type { OtherEnrolment, RegistryEntry, UploadRow, Quota } from '../engine/types'
import { PROGRAMMES } from './reference'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MALE = ['Aarav', 'Vihaan', 'Aditya', 'Arjun', 'Rohan', 'Siddharth', 'Omkar', 'Pranav', 'Sanket', 'Tejas', 'Yash', 'Harsh',
  'Kunal', 'Nikhil', 'Rahul', 'Saurabh', 'Akash', 'Vikram', 'Karthik', 'Arun', 'Gokul', 'Prakash', 'Imran', 'Faizan',
  'Rishabh', 'Ankit', 'Manish', 'Abhishek', 'Shubham', 'Vedant', 'Atharva', 'Parth', 'Varun', 'Dev', 'Ishaan', 'Ayaan',
  'Riyaz', 'Bhavesh', 'Dhruv', 'Sahil', 'Mayur', 'Chirag', 'Hrishikesh', 'Ganesh', 'Suraj', 'Vivek', 'Naveen', 'Aniket']
const FEMALE = ['Ananya', 'Diya', 'Isha', 'Kavya', 'Meera', 'Neha', 'Pooja', 'Priya', 'Riya', 'Sakshi', 'Shruti', 'Sneha',
  'Tanvi', 'Vaishnavi', 'Aishwarya', 'Divya', 'Gayatri', 'Janhavi', 'Lakshmi', 'Nandini', 'Pallavi', 'Rutuja', 'Sanika',
  'Swati', 'Aditi', 'Bhavana', 'Deepa', 'Harini', 'Keerthana', 'Priyanka', 'Sana', 'Zoya', 'Fatima', 'Ayesha', 'Mrunal',
  'Anjali', 'Komal', 'Shreya', 'Tanya', 'Rashmi', 'Gauri', 'Manasi', 'Ketaki', 'Laxmi', 'Pradnya', 'Sayali', 'Asmita']
const LAST = ['Patil', 'Deshmukh', 'Kulkarni', 'Joshi', 'Pawar', 'Shinde', 'Jadhav', 'Gaikwad', 'More', 'Bhosale', 'Chavan',
  'Kale', 'Deshpande', 'Sawant', 'Wagh', 'Sharma', 'Verma', 'Tiwari', 'Mishra', 'Dubey', 'Chouhan', 'Rajput', 'Yadav',
  'Iyer', 'Raman', 'Subramanian', 'Krishnan', 'Murugan', 'Selvam', 'Natarajan', 'Das', 'Bora', 'Singh', 'Khan', 'Shaikh',
  'Ansari', 'Reddy', 'Nair', 'Menon', 'Gupta', 'Agarwal', 'Bhat', 'Thakur', 'Mane', 'Salunkhe', 'Kadam', 'Pandey', 'Rao']
const JK = [['Aamir', 'Wani', 'M'], ['Insha', 'Lone', 'F']] as const

const PROG_LABEL = Object.fromEntries(PROGRAMMES.map((p) => [p.code, p.label]))

export interface Dataset {
  rows: UploadRow[]
  registry: RegistryEntry[]
  otherEnrolments: OtherEnrolment[]
}

export function generateDataset(seed = 26263): Dataset {
  const rnd = mulberry32(seed)
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1))
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)]

  const usedApaar = new Set<string>(['447120936618'])
  const apaar = () => {
    for (;;) {
      let s = String(int(1, 9))
      for (let i = 0; i < 11; i++) s += String(int(0, 9))
      if (!usedApaar.has(s)) { usedApaar.add(s); return s }
    }
  }
  const usedNames = new Set<string>()
  const person = () => {
    for (;;) {
      const g = rnd() < 0.52 ? 'M' : 'F'
      const name = `${pick(g === 'M' ? MALE : FEMALE)} ${pick(LAST)}`
      if (!usedNames.has(name)) { usedNames.add(name); return { name, gender: g } }
    }
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const dob = (pg: boolean) => {
    const y = pg ? int(2002, 2004) : int(2007, 2008)
    return `${y}-${pad(int(1, 12))}-${pad(int(1, 28))}`
  }
  const admission = () => {
    const d = new Date(Date.UTC(2026, 6, 15 + int(0, 44)))
    return d.toISOString().slice(0, 10)
  }
  const category = () => {
    const r = rnd()
    return r < 0.35 ? 'GEN' : r < 0.65 ? 'OBC-NCL' : r < 0.78 ? 'SC' : r < 0.85 ? 'ST' : 'EWS'
  }
  const shuffle = <T,>(arr: T[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  const registry = new Map<string, RegistryEntry>()

  const student = (prog: string, quota: Quota): UploadRow => {
    const p = person()
    const pg = prog === 'MBA'
    const a = apaar()
    const row: UploadRow = {
      rowNo: 0,
      APAAR_ID: a,
      INST_STUDENT_ID: '',
      NAME: p.name,
      DOB: dob(pg),
      GENDER: p.gender,
      CATEGORY: quota === 'REGULAR' || quota === 'TFW' ? category() : 'GEN',
      PROGRAMME: PROG_LABEL[prog],
      QUOTA: quota,
      NRI: quota === 'NRI' ? 'Y' : 'N',
      OCI: 'N',
      OCI_CARD_NO: '',
      FN: 'N',
      NATIONALITY: 'Indian',
      ADMISSION_DATE: admission(),
      APAAR_EXCEPTION: '',
    }
    registry.set(a, { apaar: a, name: row.NAME, dob: row.DOB, gender: row.GENDER })
    return row
  }

  const block = (prog: string, mix: [Quota, number][]) => {
    const rows: UploadRow[] = []
    for (const [q, n] of mix) for (let i = 0; i < n; i++) rows.push(student(prog, q))
    shuffle(rows)
    rows.forEach((r, i) => { r.INST_STUDENT_ID = `ARN26${prog}${String(i + 1).padStart(3, '0')}` })
    return rows
  }

  const cse = block('CSE', [['REGULAR', 172], ['NRI', 8], ['FN-OCI-CIWG', 6], ['TFW', 11], ['PM-USPY', 2]])
  const aids = block('AIDS', [['REGULAR', 116], ['NRI', 5], ['NRI-CONVERTED', 2]])
  const ece = block('ECE', [['REGULAR', 57], ['NRI', 3]])
  const mech = block('MECH', [['REGULAR', 59]])
  const mba = block('MBA', [['REGULAR', 58], ['NRI', 2], ['FN-OCI-CIWG', 3], ['TFW', 3]])

  const nth = (rows: UploadRow[], quota: Quota, n: number) => rows.filter((r) => r.QUOTA === quota)[n]
  const dropRegistry = (r: UploadRow) => registry.delete(r.APAAR_ID)

  const pmu = cse.filter((r) => r.QUOTA === 'PM-USPY')
  pmu.forEach((r, i) => {
    const [f, l, g] = JK[i]
    usedNames.add(`${f} ${l}`)
    r.NAME = `${f} ${l}`
    r.GENDER = g
    registry.set(r.APAAR_ID, { ...registry.get(r.APAAR_ID)!, name: r.NAME, gender: g })
  })

  const cseFn = cse.filter((r) => r.QUOTA === 'FN-OCI-CIWG')
  ;[['Nepal'], ['Bangladesh']].forEach(([nat], i) => {
    const r = cseFn[i]
    dropRegistry(r)
    Object.assign(r, { APAAR_ID: '', APAAR_EXCEPTION: 'FOREIGN_NATIONAL', FN: 'Y', NATIONALITY: nat })
  })
  ;[['United States', 'A4829163'], ['Canada', 'A5172908']].forEach(([nat, card], i) => {
    Object.assign(cseFn[2 + i], { OCI: 'Y', OCI_CARD_NO: card, NATIONALITY: nat })
  })

  const setApaar = (r: UploadRow, value: string) => { r.APAAR_ID = value }
  const r02 = [nth(cse, 'REGULAR', 9), nth(cse, 'REGULAR', 40), nth(aids, 'REGULAR', 21), nth(mech, 'REGULAR', 12)]
  {
    const [a, b, c, d] = r02
    setApaar(a, a.APAAR_ID.slice(0, 11))
    const withZero = b.APAAR_ID.slice(0, 5) + '0' + b.APAAR_ID.slice(6)
    registry.delete(b.APAAR_ID)
    registry.set(withZero, { apaar: withZero, name: b.NAME, dob: b.DOB, gender: b.GENDER })
    setApaar(b, withZero.slice(0, 5) + 'O' + withZero.slice(6))
    setApaar(c, `${c.APAAR_ID.slice(0, 5)} ${c.APAAR_ID.slice(5, 9)} ${c.APAAR_ID.slice(9)}`)
    setApaar(d, d.APAAR_ID + '7')
  }

  for (const r of [nth(cse, 'REGULAR', 55), nth(ece, 'REGULAR', 14), nth(mba, 'REGULAR', 30)]) r.APAAR_ID = ''

  ;[[nth(cse, 'REGULAR', 70), 'CONSENT_REFUSED'], [nth(aids, 'REGULAR', 44), 'CONSENT_REFUSED'],
    [nth(mech, 'REGULAR', 33), 'CONSENT_REFUSED'], [nth(ece, 'REGULAR', 40), 'GENERATION_PENDING']].forEach(([r, code]) => {
    const row = r as UploadRow
    dropRegistry(row)
    row.APAAR_ID = ''
    row.APAAR_EXCEPTION = code as string
  })

  {
    const r = nth(mech, 'REGULAR', 47)
    const y = Number(r.DOB.slice(0, 4))
    r.DOB = `${y - 1}${r.DOB.slice(4)}`
  }

  ;[[nth(cse, 'REGULAR', 88), 'Mohd. Arif Shaikh', 'Mohammed Arif Shaikh'],
    [nth(aids, 'REGULAR', 60), 'Sathish Kumar Rajan', 'Satish Kumar Rajan']].forEach(([r, rowName, regName]) => {
    const row = r as UploadRow
    row.NAME = rowName as string
    row.GENDER = 'M'
    registry.set(row.APAAR_ID, { ...registry.get(row.APAAR_ID)!, name: regName as string, gender: 'M' })
  })

  aids.filter((r) => r.QUOTA === 'NRI-CONVERTED').forEach((r) => { r.NRI = 'N' })

  {
    const [oci, r09, r08] = mba.filter((r) => r.QUOTA === 'FN-OCI-CIWG')
    Object.assign(oci, { OCI: 'Y', OCI_CARD_NO: 'A3307415', NATIONALITY: 'United Kingdom' })
    Object.assign(r09, { OCI: 'Y', OCI_CARD_NO: '' })
    Object.assign(r08, { FN: 'Y' })
  }

  const r10 = nth(cse, 'REGULAR', 120)

  const late = (rows: UploadRow[], dates: string[]) => rows.forEach((r, i) => { r.ADMISSION_DATE = dates[i] })
  late(aids.filter((r) => r.QUOTA === 'REGULAR').slice(-3), ['2026-09-08', '2026-09-09', '2026-09-10'])
  late(cse.filter((r) => r.QUOTA === 'TFW').slice(-2), ['2026-09-04', '2026-09-05'])

  const eceDupA = nth(ece, 'REGULAR', 5)
  const eceDupB = nth(ece, 'REGULAR', 6)
  const eceWithDups: UploadRow[] = []
  for (const r of ece) {
    eceWithDups.push(r)
    if (r === eceDupB) eceWithDups.push({ ...eceDupA }, { ...eceDupB })
  }

  const rows = [...cse, ...aids, ...eceWithDups, ...mech, ...mba]
  rows.forEach((r, i) => { r.rowNo = i + 2 })

  const otherEnrolments: OtherEnrolment[] = [
    { apaar: r10.APAAR_ID, pid: '1-9000932', institution: 'Meghavarsha Institute of Technology', city: 'Bhopal', ay: '2026-27' },
  ]

  return { rows, registry: [...registry.values()], otherEnrolments }
}
