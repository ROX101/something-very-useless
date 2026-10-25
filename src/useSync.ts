import { useEffect, useRef } from 'react'

/** Runs `load` on mount and every `intervalMs` while the tab is visible (and again when it becomes visible). */
export function useSync(load: () => unknown, intervalMs?: number) {
  const ref = useRef(load)
  ref.current = load

  useEffect(() => {
    let alive = true
    const run = () => { if (alive && document.visibilityState === 'visible') void ref.current() }
    run()
    const timer = intervalMs ? window.setInterval(run, intervalMs) : undefined
    document.addEventListener('visibilitychange', run)
    return () => {
      alive = false
      if (timer) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', run)
    }
  }, [intervalMs])
}
