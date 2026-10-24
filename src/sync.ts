type Apply = (value: unknown) => void

const CLIENT = Math.random().toString(36).slice(2) + Date.now().toString(36)
const appliers = new Map<string, Apply>()
let source: EventSource | null = null
let online = false

function connect() {
  if (source || typeof window === 'undefined' || !('EventSource' in window)) return
  source = new EventSource('/api/events')
  source.onopen = () => { online = true }
  source.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data) as { key?: string; value?: unknown; from?: string; reset?: boolean }
      if (msg.reset) {
        clearLocal()
        window.location.reload()
        return
      }
      if (!msg.key || msg.from === CLIENT) return
      const apply = appliers.get(msg.key)
      if (apply && msg.value !== null && msg.value !== undefined) apply(msg.value)
    } catch {
      return
    }
  }
}

function clearLocal() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('as.') && !['as.session', 'as.lang', 'as.textSize', 'as.rememberedUserId'].includes(k)).forEach((k) => localStorage.removeItem(k))
  } catch {
    return
  }
}

export function shared(key: string, apply: Apply, current: () => unknown) {
  appliers.set(key, apply)
  connect()
  fetch(`/api/state/${key}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('offline'))))
    .then((d: { value: unknown }) => {
      online = true
      if (d.value !== null && d.value !== undefined) apply(d.value)
      else push(key, current())
    })
    .catch(() => { online = false })
}

export function push(key: string, value: unknown) {
  fetch(`/api/state/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-client': CLIENT },
    body: JSON.stringify(value),
  }).catch(() => { online = false })
}

export async function resetAll() {
  try {
    await fetch('/api/reset', { method: 'POST' })
  } catch {
    online = false
  }
  clearLocal()
  window.location.reload()
}

export function isOnline() {
  return online
}
