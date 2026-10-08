import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import { toast } from "sonner"

import { usePolling } from "@/hooks/usePolling"
import { api, type Alert } from "@/lib/api"

interface AlertsContextValue {
  active: Alert[]
  unacked: number
  reload: () => void
  acknowledge: (id: number) => Promise<void>
}

const AlertsContext = createContext<AlertsContextValue | null>(null)

export function AlertsProvider({ children }: { children: ReactNode }) {
  const { data, reload } = usePolling(() => api.alerts("active"), 20_000, [])
  const active = useMemo(() => data ?? [], [data])

  const acknowledge = useCallback(
    async (id: number) => {
      try {
        await api.alertAck(id)
      } catch (e) {
        toast.error(String(e))
      }
      reload()
    },
    [reload]
  )

  const value = useMemo(
    () => ({ active, unacked: active.filter((a) => !a.acknowledged).length, reload, acknowledge }),
    [active, reload, acknowledge]
  )
  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAlerts() {
  const ctx = useContext(AlertsContext)
  if (!ctx) throw new Error("useAlerts must be used inside <AlertsProvider>")
  return ctx
}
