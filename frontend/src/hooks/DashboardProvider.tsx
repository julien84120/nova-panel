import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { api, type DashboardData, type Summary } from "@/lib/api"

const POLL_MS = 5000

interface DashboardContextValue {
  data: DashboardData | null
  /** Données filtrées selon l'hôte sélectionné dans l'en-tête. */
  view: DashboardData | null
  error: string | null
  loading: boolean
  refreshing: boolean
  refresh: () => Promise<void>
  selectedHost: string
  setSelectedHost: (id: string) => void
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedHost, setSelectedHost] = useState("all")
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      // Pas de requêtes quand l'onglet est en arrière-plan
      if (document.visibilityState === "visible") await load()
      if (!cancelled) timer.current = window.setTimeout(tick, POLL_MS)
    }
    tick()
    return () => {
      cancelled = true
      window.clearTimeout(timer.current)
    }
  }, [load])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      setData(await api.refresh())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }, [])

  const view = useMemo(() => filterByHost(data, selectedHost), [data, selectedHost])

  const value = useMemo(
    () => ({ data, view, error, loading: !data && !error, refreshing, refresh, selectedHost, setSelectedHost }),
    [data, view, error, refreshing, refresh, selectedHost]
  )
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

function filterByHost(data: DashboardData | null, hostId: string): DashboardData | null {
  if (!data || hostId === "all") return data
  const host = data.hosts.find((h) => h.id === hostId)
  if (!host) return data
  const guests = data.guests.filter((g) => g.host === host.name)
  const summary: Summary = {
    cpu: host.cpu,
    cores: host.cores,
    mem_used: host.mem_used,
    mem_total: host.mem_total,
    disk_used: host.disk_used,
    disk_total: host.disk_total,
    guests_total: guests.length,
    guests_running: guests.filter((g) => g.status === "running").length,
  }
  return {
    ...data,
    summary,
    hosts: [host],
    guests,
    tasks: data.tasks.filter((t) => t.host === host.name),
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error("useDashboard must be used inside <DashboardProvider>")
  return ctx
}
