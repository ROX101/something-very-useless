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

/**
 * Context for the in-browser preview. Cross-enrolments (R10) are known only to the server, which
 * returns the relevant ones with the upload; the bundled sample enrolment above is for the engine tests.
 */
export const PREVIEW_CONTEXT: RuleContext = { ...RULE_CONTEXT, otherEnrolments: [] }
