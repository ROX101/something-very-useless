import * as XLSX from 'xlsx'
import { writeFileSync } from 'node:fs'
import { generateDataset } from '../src/inst/data/generate'
import { DATASET_2 } from '../src/inst/data/dataset'
import { workbookFromRows } from '../src/inst/excel'

const { rows } = generateDataset()
const write = (rowsToWrite: typeof rows, path: string) => {
  const buf = XLSX.write(workbookFromRows(rowsToWrite), { type: 'buffer', bookType: 'xlsx' })
  writeFileSync(path, buf)
  console.log(`${path}: ${rowsToWrite.length} rows`)
}
write(rows, 'public/Aranya_AY2026-27_FirstYear.xlsx')
write(DATASET_2.rows, 'public/Meghavarsha_AY2026-27_FirstYear.xlsx')
