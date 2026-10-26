import { z } from 'zod'
import { Approvals, Batch } from './routes/v1'

const json = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>

const error = { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' }, details: {} }, required: ['error', 'message'] }
const errors = {
  400: { description: 'The request body failed validation. `details` lists each problem.', content: { 'application/json': { schema: error } } },
  401: { description: 'Missing, unknown or revoked API key', content: { 'application/json': { schema: error } } },
  403: { description: 'The key is valid but not allowed to act on this resource', content: { 'application/json': { schema: error } } },
  429: { description: 'Rate limit: 120 requests per minute per key' },
}
const pid = { name: 'pid', in: 'path', required: true, schema: { type: 'string', example: '1-9000417' }, description: 'AICTE permanent institution ID' }

/** OpenAPI 3.1 description of the machine API. Request schemas are generated from the same zod schemas the server enforces. */
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'APAAR-Sathi integration API',
    version: '1.0.0',
    description: [
      'For institution ERP systems and AICTE systems.',
      'Authenticate with an API key: `Authorization: Bearer apaar_<id>_<secret>` (or `X-API-Key`). Institution nodal officers create keys in the portal under Upload > ERP via API; the AICTE IT cell creates AICTE system keys.',
      'Send `Idempotency-Key: <uuid>` on POSTs so a retried request is not processed twice; the stored response is replayed with `Idempotent-Replayed: true`.',
      'Records go through the same validation as an Excel upload. Submitting to AICTE stays a human step in the portal, because the nodal officer signs the declaration.',
    ].join('\n\n'),
  },
  servers: [{ url: '/api/v1' }],
  security: [{ apiKey: [] }],
  components: {
    securitySchemes: { apiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'apaar_<id>_<secret>' } },
    schemas: { EnrolmentBatch: json(Batch), ApprovalsImport: json(Approvals), Error: error },
  },
  paths: {
    '/institutions/{pid}/enrolments:batch': {
      post: {
        summary: 'Send up to 1,000 enrolment records',
        description: '`mode: replace` starts a new working set for the academic year; `append` adds to it (send a large roster as several batches). Also available as `/enrolments/batch`.',
        parameters: [pid, { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EnrolmentBatch' } } } },
        responses: {
          200: {
            description: 'Validated. `issues` lists the rows from this batch that need attention; `summary` covers the whole working set.',
            content: { 'application/json': { schema: { type: 'object', properties: {
              uploadId: { type: 'integer' }, mode: { type: 'string' }, received: { type: 'integer' }, totalRows: { type: 'integer' },
              readyToSubmit: { type: 'boolean' }, summary: { type: 'object' }, issues: { type: 'array' }, next: { type: 'string' },
            } } } },
          },
          ...errors,
        },
      },
    },
    '/institutions/{pid}/enrolments/validation': {
      get: { summary: 'Validation result for the current working set', parameters: [pid], responses: { 200: { description: 'Summary and every row with issues' }, 404: { description: 'Nothing received yet' }, ...errors } },
    },
    '/institutions/{pid}/students/{id}': {
      get: {
        summary: 'One student by APAAR ID or institution student ID',
        parameters: [pid, { name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'The row with its validation status and flags' }, 404: { description: 'Not in the current data' }, ...errors },
      },
    },
    '/aicte/approvals': {
      post: {
        summary: 'Import approved intake (AICTE system keys only)',
        description: 'Creates or updates institutions and their programmes with the approved intake for the academic year. `lastYearAdmitted` feeds the year-on-year anomaly check.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ApprovalsImport' } } } },
        responses: { 200: { description: 'Counts imported' }, ...errors },
      },
    },
  },
}
