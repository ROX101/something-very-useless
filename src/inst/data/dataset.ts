import { generateDataset } from './generate'
import { INSTITUTION, PROGRAMMES } from './reference'
import type { RuleContext } from '../engine/rules'

export const DATASET = generateDataset()

export const RULE_CONTEXT: RuleContext = {
  institutionPid: INSTITUTION.pid,
  programmes: PROGRAMMES,
  registry: DATASET.registry,
  otherEnrolments: DATASET.otherEnrolments,
}
