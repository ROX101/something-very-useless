export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message)
  }
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

let onUnauthorized: (() => void) | null = null
/** Called once by the app shell so any 401 signs the user out locally. */
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection and try again.')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized?.()
    throw new ApiError(res.status, data.error ?? 'error', data.message ?? `Request failed (${res.status})`, data.details)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => call<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => call<T>('PUT', path, body),
  del: <T = void>(path: string) => call<T>('DELETE', path),
}
