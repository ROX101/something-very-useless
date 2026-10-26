import { sql } from 'drizzle-orm'
import type { Db } from '../db/client'

/**
 * Statutory report formats built from the national enrolment register (current status, so in-year withdrawals,
 * transfers and lateral entries are reflected) and each programme's approved intake.
 *
 * - NIRF "Sanctioned (Approved) Intake" and "Total Actual Student Strength" columns.
 * - AISHE enrolment by gender and social category, with foreign students.
 * - NBA SAR enrolment ratio: ER = (N1 + N4) / N, where N is sanctioned intake, N1 first-year admissions less
 *   students who migrated out, and N4 admissions through supernumerary quotas. N2 (lateral entry) is shown apart.
 */
export const PROFILES = ['nirf', 'aishe', 'nba'] as const
export type Profile = (typeof PROFILES)[number]

const SUPERNUMERARY = ['FN-OCI-CIWG', 'TFW', 'PM-USPY']

interface Agg {
  pid: string; institution: string; city: string; state: string; programme: string; intake: number
  total: number; male: number; female: number; trans: number; foreign: number
  gen: number; ews: number; obc: number; sc: number; st: number
  tfw: number; uspy: number; supernumerary: number; first_regular: number; transferred: number; withdrawn: number; lateral: number
}

async function aggregate(db: Db, ay: string, states: string[] | null, state: string | null) {
  const scope = [...(states ? [sql`i.state in ${states.length ? states : ['__']}`] : []), ...(state ? [sql`i.state = ${state}`] : [])]
  const where = scope.length ? sql`and ${sql.join(scope, sql` and `)}` : sql``
  const res = await db.execute<Record<string, unknown>>(sql`
    select e.institution_pid as pid, i.name as institution, i.city, i.state, coalesce(e.programme, 'Not stated') as programme,
      coalesce(max(p.intake), 0)::int as intake,
      count(*) filter (where e.status = 'active')::int as total,
      count(*) filter (where e.status = 'active' and e.gender = 'M')::int as male,
      count(*) filter (where e.status = 'active' and e.gender = 'F')::int as female,
      count(*) filter (where e.status = 'active' and e.gender = 'T')::int as trans,
      count(*) filter (where e.status = 'active' and e.foreign)::int as foreign,
      count(*) filter (where e.status = 'active' and e.category = 'GEN')::int as gen,
      count(*) filter (where e.status = 'active' and e.category = 'EWS')::int as ews,
      count(*) filter (where e.status = 'active' and e.category = 'OBC-NCL')::int as obc,
      count(*) filter (where e.status = 'active' and e.category = 'SC')::int as sc,
      count(*) filter (where e.status = 'active' and e.category = 'ST')::int as st,
      count(*) filter (where e.status = 'active' and e.quota = 'TFW')::int as tfw,
      count(*) filter (where e.status = 'active' and e.quota = 'PM-USPY')::int as uspy,
      count(*) filter (where e.entry = 'first_year' and e.quota in ${SUPERNUMERARY})::int as supernumerary,
      count(*) filter (where e.entry = 'first_year' and coalesce(e.quota, 'REGULAR') not in ${SUPERNUMERARY})::int as first_regular,
      count(*) filter (where e.entry = 'first_year' and e.status = 'transferred')::int as transferred,
      count(*) filter (where e.status = 'withdrawn')::int as withdrawn,
      count(*) filter (where e.entry = 'lateral' and e.status = 'active')::int as lateral
    from enrolments e
    join institutions i on i.pid = e.institution_pid
    left join programmes p on p.institution_pid = e.institution_pid and p.label = e.programme
    where e.ay = ${ay} ${where}
    group by e.institution_pid, i.name, i.city, i.state, e.programme
    order by i.state, i.name, e.programme`)
  return res.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /^\d+$/.test(v) && !['pid', 'institution', 'city', 'state', 'programme'].includes(k) ? Number(v) : v])) as unknown as Agg)
}

export interface Report { profile: Profile; title: string; header: string[]; rows: (string | number)[][]; notes: string[] }

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0)

export async function buildReport(db: Db, profile: Profile, ay: string, states: string[] | null, state: string | null): Promise<Report> {
  const rows = await aggregate(db, ay, states, state)
  const where = (r: Agg) => [r.institution, r.city, r.state, r.programme]
  if (profile === 'nirf') {
    return {
      profile, title: `NIRF: Sanctioned intake and total actual student strength, AY ${ay}`,
      header: ['Institution', 'City', 'State', 'Programme', 'Sanctioned intake', 'Male', 'Female', 'Transgender', 'Total students',
        'Outside country', 'Economically backward (EWS)', 'Socially challenged (SC+ST+OBC)', 'Tuition fee waiver (TFW)', 'PM-USPY scholarship'],
      rows: rows.map((r) => [...where(r), r.intake, r.male, r.female, r.trans, r.total, r.foreign, r.ews, r.sc + r.st + r.obc, r.tfw, r.uspy]),
      notes: [
        'Counts are students active on the date of the report, after in-year withdrawals and transfers.',
        'NIRF also asks for students from within and outside the state. The AICTE enrolment return does not collect domicile, so those columns are left to the institution.',
        'Fee reimbursement here covers seats the return records (TFW and PM-USPY); state and private scholarships are not in the return.',
      ],
    }
  }
  if (profile === 'aishe') {
    return {
      profile, title: `AISHE: Enrolment by gender and social category, AY ${ay}`,
      header: ['Institution', 'City', 'State', 'Programme', 'Total', 'Male', 'Female', 'Transgender', 'General', 'EWS', 'OBC', 'SC', 'ST', 'Foreign students', 'Female %'],
      rows: rows.map((r) => [...where(r), r.total, r.male, r.female, r.trans, r.gen, r.ews, r.obc, r.sc, r.st, r.foreign, pct(r.female, r.total)]),
      notes: ['AISHE also collects PwD and minority status, which the enrolment return does not hold.'],
    }
  }
  return {
    profile, title: `NBA SAR: Enrolment ratio, first year, AY ${ay}`,
    header: ['Institution', 'City', 'State', 'Programme', 'N (sanctioned intake)', 'N1 (admitted, less migrated out)', 'N4 (supernumerary)', 'N2 (lateral entry)', 'ER = (N1+N4)/N %'],
    rows: rows.map((r) => {
      const n1 = Math.max(0, r.first_regular - r.transferred)
      return [...where(r), r.intake, n1, r.supernumerary, r.lateral, pct(n1 + r.supernumerary, r.intake)]
    }),
    notes: ['N1 subtracts students recorded as transferred out. N2 is shown for criterion 4 but is not part of the enrolment ratio.'],
  }
}
