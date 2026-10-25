export interface StateTile {
  code: string
  name: string
  x: number
  y: number
}

export interface StateStat {
  code: string
  institutions: number
  submitted: number
  excessAlerts: number
  openAlerts: number
  apaarPct: number
}

export type StateRow = StateTile & Omit<StateStat, 'code'>

/** Tile-map positions only. Figures come from /api/aicte/insights. */
export const STATE_TILES: StateTile[] = [
  {code: 'JK', name: 'Jammu & Kashmir', x: 3, y: 0},
  {code: 'LA', name: 'Ladakh', x: 4, y: 0},
  {code: 'PB', name: 'Punjab', x: 3, y: 1},
  {code: 'HP', name: 'Himachal Pradesh', x: 4, y: 1},
  {code: 'CH', name: 'Chandigarh', x: 2, y: 2},
  {code: 'HR', name: 'Haryana', x: 3, y: 2},
  {code: 'DL', name: 'Delhi', x: 4, y: 2},
  {code: 'UK', name: 'Uttarakhand', x: 5, y: 2},
  {code: 'RJ', name: 'Rajasthan', x: 2, y: 3},
  {code: 'UP', name: 'Uttar Pradesh', x: 4, y: 3},
  {code: 'BR', name: 'Bihar', x: 6, y: 3},
  {code: 'SK', name: 'Sikkim', x: 7, y: 3},
  {code: 'AR', name: 'Arunachal Pradesh', x: 9, y: 3},
  {code: 'GJ', name: 'Gujarat', x: 1, y: 4},
  {code: 'MP', name: 'Madhya Pradesh', x: 3, y: 4},
  {code: 'JH', name: 'Jharkhand', x: 5, y: 4},
  {code: 'WB', name: 'West Bengal', x: 6, y: 4},
  {code: 'AS', name: 'Assam', x: 8, y: 4},
  {code: 'NL', name: 'Nagaland', x: 9, y: 4},
  {code: 'DD', name: 'Dadra & Nagar Haveli and Daman & Diu', x: 1, y: 5},
  {code: 'MH', name: 'Maharashtra', x: 2, y: 5},
  {code: 'CG', name: 'Chhattisgarh', x: 4, y: 5},
  {code: 'OD', name: 'Odisha', x: 5, y: 5},
  {code: 'ML', name: 'Meghalaya', x: 7, y: 5},
  {code: 'MN', name: 'Manipur', x: 8, y: 5},
  {code: 'TR', name: 'Tripura', x: 9, y: 5},
  {code: 'GA', name: 'Goa', x: 2, y: 6},
  {code: 'TS', name: 'Telangana', x: 3, y: 6},
  {code: 'AP', name: 'Andhra Pradesh', x: 4, y: 6},
  {code: 'MZ', name: 'Mizoram', x: 8, y: 6},
  {code: 'KA', name: 'Karnataka', x: 2, y: 7},
  {code: 'PY', name: 'Puducherry', x: 4, y: 7},
  {code: 'AN', name: 'Andaman & Nicobar', x: 6, y: 7},
  {code: 'KL', name: 'Kerala', x: 2, y: 8},
  {code: 'TN', name: 'Tamil Nadu', x: 3, y: 8},
  {code: 'LD', name: 'Lakshadweep', x: 1, y: 8},
]

const ZERO = { institutions: 0, submitted: 0, excessAlerts: 0, openAlerts: 0, apaarPct: 0 }

/** Every state tile with its live figures (zero where there is no data yet). */
export function withStats(stats: StateStat[]): StateRow[] {
  const by = new Map(stats.map((s) => [s.code, s]))
  return STATE_TILES.map((t) => {
    const { code: _c, ...rest } = by.get(t.code) ?? { code: t.code, ...ZERO }
    return { ...t, ...rest }
  })
}
