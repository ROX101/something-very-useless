export interface StateRow {
  code: string
  name: string
  x: number
  y: number
  institutions: number
  submitted: number
  excessAlerts: number
  openAlerts: number
  apaarPct: number
}

export const STATES: StateRow[] = [
  {code: 'JK', name: 'Jammu & Kashmir', x: 3, y: 0, institutions: 94, submitted: 66, excessAlerts: 1, openAlerts: 3, apaarPct: 95.6},
  {code: 'LA', name: 'Ladakh', x: 4, y: 0, institutions: 4, submitted: 2, excessAlerts: 0, openAlerts: 0, apaarPct: 93.9},
  {code: 'PB', name: 'Punjab', x: 3, y: 1, institutions: 448, submitted: 352, excessAlerts: 12, openAlerts: 40, apaarPct: 94.9},
  {code: 'HP', name: 'Himachal Pradesh', x: 4, y: 1, institutions: 118, submitted: 99, excessAlerts: 3, openAlerts: 11, apaarPct: 95.9},
  {code: 'CH', name: 'Chandigarh', x: 2, y: 2, institutions: 29, submitted: 18, excessAlerts: 1, openAlerts: 3, apaarPct: 95.1},
  {code: 'HR', name: 'Haryana', x: 3, y: 2, institutions: 495, submitted: 387, excessAlerts: 10, openAlerts: 28, apaarPct: 93.9},
  {code: 'DL', name: 'Delhi', x: 4, y: 2, institutions: 189, submitted: 134, excessAlerts: 2, openAlerts: 7, apaarPct: 97.2},
  {code: 'UK', name: 'Uttarakhand', x: 5, y: 2, institutions: 177, submitted: 146, excessAlerts: 4, openAlerts: 14, apaarPct: 98.6},
  {code: 'RJ', name: 'Rajasthan', x: 2, y: 3, institutions: 566, submitted: 376, excessAlerts: 13, openAlerts: 41, apaarPct: 96.8},
  {code: 'UP', name: 'Uttar Pradesh', x: 4, y: 3, institutions: 1418, submitted: 1394, excessAlerts: 55, openAlerts: 681, apaarPct: 95.0},
  {code: 'BR', name: 'Bihar', x: 6, y: 3, institutions: 236, submitted: 172, excessAlerts: 7, openAlerts: 27, apaarPct: 99.0},
  {code: 'SK', name: 'Sikkim', x: 7, y: 3, institutions: 9, submitted: 8, excessAlerts: 0, openAlerts: 0, apaarPct: 98.2},
  {code: 'AR', name: 'Arunachal Pradesh', x: 9, y: 3, institutions: 9, submitted: 7, excessAlerts: 0, openAlerts: 0, apaarPct: 93.7},
  {code: 'GJ', name: 'Gujarat', x: 1, y: 4, institutions: 708, submitted: 573, excessAlerts: 11, openAlerts: 33, apaarPct: 98.7},
  {code: 'MP', name: 'Madhya Pradesh', x: 3, y: 4, institutions: 660, submitted: 410, excessAlerts: 10, openAlerts: 42, apaarPct: 94.7},
  {code: 'JH', name: 'Jharkhand', x: 5, y: 4, institutions: 165, submitted: 123, excessAlerts: 5, openAlerts: 14, apaarPct: 98.5},
  {code: 'WB', name: 'West Bengal', x: 6, y: 4, institutions: 448, submitted: 282, excessAlerts: 8, openAlerts: 22, apaarPct: 97.4},
  {code: 'AS', name: 'Assam', x: 8, y: 4, institutions: 106, submitted: 76, excessAlerts: 2, openAlerts: 8, apaarPct: 95.2},
  {code: 'NL', name: 'Nagaland', x: 9, y: 4, institutions: 8, submitted: 6, excessAlerts: 0, openAlerts: 0, apaarPct: 96.8},
  {code: 'DD', name: 'Dadra & Nagar Haveli and Daman & Diu', x: 1, y: 5, institutions: 12, submitted: 10, excessAlerts: 0, openAlerts: 0, apaarPct: 95.5},
  {code: 'MH', name: 'Maharashtra', x: 2, y: 5, institutions: 1601, submitted: 1225, excessAlerts: 37, openAlerts: 106, apaarPct: 94.2},
  {code: 'CG', name: 'Chhattisgarh', x: 4, y: 5, institutions: 212, submitted: 181, excessAlerts: 3, openAlerts: 11, apaarPct: 96.8},
  {code: 'OD', name: 'Odisha', x: 5, y: 5, institutions: 389, submitted: 279, excessAlerts: 11, openAlerts: 41, apaarPct: 97.0},
  {code: 'ML', name: 'Meghalaya', x: 7, y: 5, institutions: 14, submitted: 9, excessAlerts: 0, openAlerts: 0, apaarPct: 95.6},
  {code: 'MN', name: 'Manipur', x: 8, y: 5, institutions: 12, submitted: 8, excessAlerts: 0, openAlerts: 0, apaarPct: 98.4},
  {code: 'TR', name: 'Tripura', x: 9, y: 5, institutions: 18, submitted: 13, excessAlerts: 0, openAlerts: 0, apaarPct: 94.3},
  {code: 'GA', name: 'Goa', x: 2, y: 6, institutions: 35, submitted: 27, excessAlerts: 1, openAlerts: 4, apaarPct: 95.7},
  {code: 'TS', name: 'Telangana', x: 3, y: 6, institutions: 920, submitted: 610, excessAlerts: 11, openAlerts: 29, apaarPct: 98.7},
  {code: 'AP', name: 'Andhra Pradesh', x: 4, y: 6, institutions: 1002, submitted: 651, excessAlerts: 14, openAlerts: 48, apaarPct: 93.7},
  {code: 'MZ', name: 'Mizoram', x: 8, y: 6, institutions: 7, submitted: 4, excessAlerts: 0, openAlerts: 0, apaarPct: 94.1},
  {code: 'KA', name: 'Karnataka', x: 2, y: 7, institutions: 1061, submitted: 890, excessAlerts: 26, openAlerts: 98, apaarPct: 97.2},
  {code: 'PY', name: 'Puducherry', x: 4, y: 7, institutions: 59, submitted: 39, excessAlerts: 1, openAlerts: 4, apaarPct: 98.3},
  {code: 'AN', name: 'Andaman & Nicobar', x: 6, y: 7, institutions: 6, submitted: 5, excessAlerts: 0, openAlerts: 0, apaarPct: 97.8},
  {code: 'KL', name: 'Kerala', x: 2, y: 8, institutions: 377, submitted: 271, excessAlerts: 10, openAlerts: 28, apaarPct: 97.6},
  {code: 'TN', name: 'Tamil Nadu', x: 3, y: 8, institutions: 1592, submitted: 992, excessAlerts: 20, openAlerts: 66, apaarPct: 95.6},
  {code: 'LD', name: 'Lakshadweep', x: 1, y: 8, institutions: 0, submitted: 0, excessAlerts: 0, openAlerts: 0, apaarPct: 0},
]
