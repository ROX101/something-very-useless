import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { ZodError, type ZodType } from 'zod'

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: unknown) {
    super(message ?? code)
  }
}

export const badRequest = (code: string, message?: string, details?: unknown) => new HttpError(400, code, message, details)
export const notFound = (what = 'Not found') => new HttpError(404, 'not_found', what)
export const forbidden = (message = 'You do not have access to this') => new HttpError(403, 'forbidden', message)
export const conflict = (code: string, message?: string) => new HttpError(409, code, message)

export const handler = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next) }

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value)
  if (!r.success) throw badRequest('invalid_request', 'Request validation failed', r.error.issues)
  return r.data
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message, details: err.details })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'invalid_request', message: 'Request validation failed', details: err.issues })
    return
  }
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'payload_too_large', message: 'Upload is too large' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'internal', message: 'Something went wrong' })
}
