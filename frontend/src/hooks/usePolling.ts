import { useEffect, useState } from "react"

/** Charge `fn` puis le rappelle toutes les `intervalMs` (pause quand l'onglet est caché). */
export function usePolling<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const run = async () => {
      if (document.visibilityState === "visible") {
        try {
          const r = await fn()
          if (!cancelled) {
            setData(r)
            setError(null)
          }
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e))
        }
      }
      if (!cancelled) timer = window.setTimeout(run, intervalMs)
    }
    run()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, intervalMs])

  return { data, error, reload: () => setTick((t) => t + 1) }
}
