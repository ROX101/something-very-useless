import { generateDataset } from './generate'
import { generateMeghavarsha } from './generateSecond'
import { INSTITUTION, PROGRAMMES } from './reference'
import type { RuleContext } from '../engine/rules'

export const DATASET = generateDataset()

const ARANYA_CONTEXT: RuleContext = {
  institutionPid: INSTITUTION.pid,
  programmes: PROGRAMMES,
  registry: DATASET.registry,
  otherEnrolments: DATASET.otherEnrolments,
}

/** The second demo institution's sample file, sharing students with Aranya. */
export const DATASET_2 = generateMeghavarsha(DATASET.rows, ARANYA_CONTEXT)

/** The mock APAAR registry holds both institutions' students, as the real one holds everyone's. */
export const RULE_CONTEXT: RuleContext = { ...ARANYA_CONTEXT, registry: [...DATASET.registry, ...DATASET_2.registry] }

/**
 * Context for the in-browser preview. Cross-enrolments (R10) are known only to the server, which
 * returns the relevant ones with the upload; the bundled sample enrolment above is for the engine tests.
 */
export const PREVIEW_CONTEXT: RuleContext = { ...RULE_CONTEXT, otherEnrolments: [] }
