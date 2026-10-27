import type { RegistryEntry, UploadRow } from '../engine/types'
import { runRules, type RuleContext } from '../engine/rules'
import { PROBABLE_NAME_SIMILARITY } from '../engine/rules'
import { nameSimilarity, normaliseName } from '../engine/similarity'
import { MEGHAVARSHA_PROGRAMMES } from './reference'

/**
 * Sample first-year file for Meghavarsha Institute of Technology, Bhopal, built to show cross-institution checks
 * once Aranya has submitted:
 * - 38 students who are also on Aranya's roster under the same APAAR ID (R10: enrolled at another institution);
 * - 9 students who look like Aranya students under a slightly different spelling, with no APAAR ID
 *   (R11: probable duplicate, same date of birth and a very similar name);
 * - intake up 65% on last year and 45% of admissions in the last week of the window (statistical anomalies).
 * Everything else is clean, so the file can be submitted after review.
 */
export const CROSS_ENROLLED = 38
export const PROBABLE_DUPLICATES = 9

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

const MALE = ['Ayush', 'Shivam', 'Utkarsh', 'Ritik', 'Aman', 'Harshit', 'Prateek', 'Deepak', 'Mohit', 'Anurag', 'Sachin', 'Gaurav',
  'Abhinav', 'Saket', 'Nitin', 'Lokesh', 'Raghav', 'Tushar', 'Yuvraj', 'Kshitij', 'Pankaj', 'Himanshu', 'Vaibhav', 'Shantanu']
const FEMALE = ['Khushi', 'Muskan', 'Nidhi', 'Shivani', 'Anushka', 'Pragya', 'Ritu', 'Sonal', 'Tanisha', 'Vandana', 'Akanksha', 'Bhumika',
  'Charu', 'Garima', 'Jyoti', 'Kirti', 'Mansi', 'Payal', 'Radhika', 'Shalini', 'Surbhi', 'Trisha', 'Urvashi', 'Yashika']
const LAST = ['Raghuvanshi', 'Tomar', 'Bhadoria', 'Saxena', 'Shrivastava', 'Dwivedi', 'Tripathi', 'Chaurasia', 'Kushwaha', 'Malviya',
  'Patidar', 'Dangi', 'Lodhi', 'Sisodia', 'Parmar', 'Solanki', 'Ahirwar', 'Meena', 'Jain', 'Khandelwal', 'Rathore', 'Bundela']

/** Spelling variants a clerk might type: a doubled or dropped letter, ee for i, a spelt-out initial. */
/** Spelling variants a clerk might type for the first name: x for ksh, oo for u, t for th, a dropped final a, ee for i. */
const first = (f: (w: string) => string) => (n: string) => { const [a, ...rest] = n.split(' '); return [f(a), ...rest].join(' ') }
const VARIANTS: ((n: string) => string)[] = [
  first((w) => w.replace(/x/, 'ksh')),
  first((w) => w.replace(/ksh/, 'x')),
  first((w) => w.replace(/u(?=[^aeiou]*$)/, 'oo')),
  first((w) => w.replace(/th(?=[aeiou])/, 't')),
  first((w) => (w.length > 5 ? w.replace(/a$/, '') : w)),
  first((w) => w.replace(/i(?=[^aeiou]*$)/, 'ee')),
  first((w) => w.replace(/ee/, 'i')),
  first((w) => w.replace(/([aeiou])([^aeiou])(?=[aeiou])/, '$1$2$2')),
]

export function probableVariant(name: string): string | null {
  for (const v of VARIANTS) {
    const out = v(name)
    if (out !== name && normaliseName(out) !== normaliseName(name) && nameSimilarity(out, name) >= PROBABLE_NAME_SIMILARITY) return out
  }
  return null
}

export interface SecondDataset { rows: UploadRow[]; registry: RegistryEntry[]; crossApaar: string[]; probableOf: { name: string; aranyaName: string; dob: string }[] }

export function generateMeghavarsha(aranyaRows: UploadRow[], aranyaContext: RuleContext, seed = 932): SecondDataset {
  const rnd = mulberry32(seed)
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1))
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)]
  const pad = (n: number) => String(n).padStart(2, '0')

  // Only Aranya students who pass every check there, so Aranya's own story does not change.
  const clean = runRules(aranyaRows, { ...aranyaContext, otherEnrolments: [] }).rows
    .filter((r) => r.status === 'clean' && r.row.QUOTA === 'REGULAR' && /^\d{12}$/.test(r.row.APAAR_ID) && r.row.PROGRAMME !== 'MBA')
    .map((r) => r.row)
  const step = Math.floor(clean.length / (CROSS_ENROLLED + PROBABLE_DUPLICATES * 3))
  const pool = clean.filter((_, i) => i % step === 0)
  const cross = pool.slice(0, CROSS_ENROLLED)
  const lookalikes: UploadRow[] = []
  for (const r of pool.slice(CROSS_ENROLLED)) {
    if (lookalikes.length === PROBABLE_DUPLICATES) break
    if (probableVariant(r.NAME)) lookalikes.push(r)
  }

  const used = new Set([...aranyaContext.registry.map((e) => e.apaar)])
  const usedNames = new Set(aranyaRows.map((r) => r.NAME))
  const apaar = () => {
    for (;;) {
      let s = String(int(1, 9))
      for (let i = 0; i < 11; i++) s += String(int(0, 9))
      if (!used.has(s)) { used.add(s); return s }
    }
  }
  const person = () => {
    for (;;) {
      const g = rnd() < 0.55 ? 'M' : 'F'
      const name = `${pick(g === 'M' ? MALE : FEMALE)} ${pick(LAST)}`
      if (!usedNames.has(name)) { usedNames.add(name); return { name, gender: g } }
    }
  }
  const category = () => {
    const r = rnd()
    return r < 0.32 ? 'GEN' : r < 0.66 ? 'OBC-NCL' : r < 0.8 ? 'SC' : r < 0.9 ? 'ST' : 'EWS'
  }

  const registry: RegistryEntry[] = []
  const base = (): Omit<UploadRow, 'rowNo' | 'APAAR_ID' | 'INST_STUDENT_ID' | 'NAME' | 'DOB' | 'GENDER' | 'CATEGORY' | 'PROGRAMME' | 'ADMISSION_DATE'> => ({
    QUOTA: 'REGULAR', NRI: 'N', OCI: 'N', OCI_CARD_NO: '', FN: 'N', NATIONALITY: 'Indian', APAAR_EXCEPTION: '',
  })

  const COUNTS: Record<string, number> = { CSE: 112, AIDS: 56, ECE: 48, MECH: 44 }
  const out: UploadRow[] = []
  const byProg = (label: string) => MEGHAVARSHA_PROGRAMMES.find((p) => p.label === label)?.code ?? 'CSE'
  const taken: Record<string, number> = { CSE: 0, AIDS: 0, ECE: 0, MECH: 0 }

  // Shared students keep their programme where Meghavarsha offers it.
  const place = (label: string) => {
    let code = byProg(label)
    if (taken[code] >= COUNTS[code]) code = Object.keys(COUNTS).find((c) => taken[c] < COUNTS[c])!
    taken[code]++
    return MEGHAVARSHA_PROGRAMMES.find((p) => p.code === code)!.label
  }
  for (const r of cross) {
    out.push({ ...base(), rowNo: 0, APAAR_ID: r.APAAR_ID, INST_STUDENT_ID: '', NAME: r.NAME, DOB: r.DOB, GENDER: r.GENDER, CATEGORY: r.CATEGORY, PROGRAMME: place(r.PROGRAMME), ADMISSION_DATE: '' })
  }
  const probableOf: SecondDataset['probableOf'] = []
  for (const r of lookalikes) {
    const name = probableVariant(r.NAME)!
    probableOf.push({ name, aranyaName: r.NAME, dob: r.DOB })
    out.push({ ...base(), rowNo: 0, APAAR_ID: '', APAAR_EXCEPTION: 'GENERATION_PENDING', INST_STUDENT_ID: '', NAME: name, DOB: r.DOB, GENDER: r.GENDER, CATEGORY: r.CATEGORY, PROGRAMME: place(r.PROGRAMME), ADMISSION_DATE: '' })
  }
  for (const p of MEGHAVARSHA_PROGRAMMES) {
    while (taken[p.code] < COUNTS[p.code]) {
      taken[p.code]++
      const who = person()
      const a = apaar()
      const dob = `${int(2007, 2008)}-${pad(int(1, 12))}-${pad(int(1, 28))}`
      registry.push({ apaar: a, name: who.name, dob, gender: who.gender })
      out.push({ ...base(), rowNo: 0, APAAR_ID: a, INST_STUDENT_ID: '', NAME: who.name, DOB: dob, GENDER: who.gender, CATEGORY: category(), PROGRAMME: p.label, ADMISSION_DATE: '' })
    }
  }

  // Order by programme, number students per programme, and date admissions: 45% in the window's last week.
  const order = MEGHAVARSHA_PROGRAMMES.map((p) => p.label)
  out.sort((a, b) => order.indexOf(a.PROGRAMME) - order.indexOf(b.PROGRAMME))
  const seq: Record<string, number> = {}
  out.forEach((r, i) => {
    const code = byProg(r.PROGRAMME)
    seq[code] = (seq[code] ?? 0) + 1
    r.INST_STUDENT_ID = `MIT26${code}${String(seq[code]).padStart(3, '0')}`
    r.rowNo = i + 2
    const late = rnd() < 0.45
    const d = late ? new Date(Date.UTC(2026, 8, int(4, 10))) : new Date(Date.UTC(2026, 6, 15 + int(0, 40)))
    r.ADMISSION_DATE = d.toISOString().slice(0, 10)
  })

  return { rows: out, registry, crossApaar: cross.map((r) => r.APAAR_ID), probableOf }
}
