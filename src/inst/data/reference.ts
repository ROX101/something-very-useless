import type { Programme } from '../engine/types'

export const INSTITUTION = {
  pid: '1-9000417',
  name: 'Aranya Institute of Technology',
  city: 'Nashik',
  state: 'Maharashtra',
  ay: '2026-27',
  initials: 'AIT',
  established: 2009,
  type: 'Private, self-financing',
  university: 'Godavari Technological University',
  approval: 'Extension of Approval 2026-27',
  motto: 'Vidya Viveka Seva',
}

export const PROGRAMMES: Programme[] = [
  { code: 'CSE', label: 'B.Tech CSE', name: 'B.Tech Computer Science & Engineering', intake: 180 },
  { code: 'AIDS', label: 'B.Tech AI&DS', name: 'B.Tech Artificial Intelligence & Data Science', intake: 120 },
  { code: 'ECE', label: 'B.Tech ECE', name: 'B.Tech Electronics & Communication Engineering', intake: 60 },
  { code: 'MECH', label: 'B.Tech MECH', name: 'B.Tech Mechanical Engineering', intake: 60 },
  { code: 'MBA', label: 'MBA', name: 'Master of Business Administration', intake: 60 },
]

export const DEADLINE = '2026-11-29'

export const caps = (intake: number) => ({
  nri: Math.floor(intake * 0.05),
  fnOciCiwg: Math.floor(intake * 0.15),
  tfw: Math.floor(intake * 0.05),
  pmUspy: 2,
})

export const PM_USPY_INSTITUTION_MAX = 10

export const CLAUSES: Record<string, string> = {
  '2.25(n)': 'Student enrolment details are to be uploaded before 30 November.',
  '2.8(b)': 'NRI: up to 5% of seats within the Approved Intake.',
  '2.8(d)': 'Vacant NRI seats are filled by general merit candidates at the regular fee.',
  '2.9': 'Foreign National / OCI / CIWG: up to 15% supernumerary seats per course.',
  '6.42(d)(i)': 'Tuition Fee Waiver: up to 5% supernumerary, only if at least 50% of the intake is filled.',
  '6.43(b)': 'PM-USPY: 2 supernumerary seats per course, up to 10 per institution.',
  '7.4(g)': 'Excess admission is not allowed under any circumstances.',
  '7.3(g)': 'Liable to a fine of 5× the total course fee per excess admission.',
  'Def. 10': 'Approved Intake excludes supernumerary seats.',
}

/**
 * A second demo institution, for showing cross-institution checks. Its sample file shares students with
 * Aranya: some under the same APAAR ID (R10) and some under a slightly different name with no APAAR ID (R11).
 */
export const MEGHAVARSHA = {
  pid: '1-9000932',
  name: 'Meghavarsha Institute of Technology',
  city: 'Bhopal',
  state: 'MP',
  initials: 'MIT',
  established: 2014,
  type: 'Private, self-financing',
  university: 'Narmada Technical University',
  approval: 'Extension of Approval 2026-27',
  motto: 'Gyanam Param Balam',
}

/** Last year's first-year admissions are low on purpose: this year's intake jump is a statistical anomaly. */
export const MEGHAVARSHA_PROGRAMMES: (Programme & { lastYearAdmitted: number })[] = [
  { code: 'CSE', label: 'B.Tech CSE', name: 'B.Tech Computer Science & Engineering', intake: 120, lastYearAdmitted: 68 },
  { code: 'AIDS', label: 'B.Tech AI&DS', name: 'B.Tech Artificial Intelligence & Data Science', intake: 60, lastYearAdmitted: 34 },
  { code: 'ECE', label: 'B.Tech ECE', name: 'B.Tech Electronics & Communication Engineering', intake: 60, lastYearAdmitted: 29 },
  { code: 'MECH', label: 'B.Tech MECH', name: 'B.Tech Mechanical Engineering', intake: 60, lastYearAdmitted: 27 },
]
