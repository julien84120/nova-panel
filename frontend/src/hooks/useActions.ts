import { useCallback } from "react"
import { toast } from "sonner"

import { useDashboard } from "@/hooks/DashboardProvider"
import { useI18n } from "@/i18n/I18nProvider"
import type { TranslationKey } from "@/i18n/translations"
import { api, ApiError, type ContainerAction, type Guest, type GuestAction } from "@/lib/api"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function useActions() {
  const { t } = useI18n()
  const { pollSoon } = useDashboard()

  const fmt = useCallback(
    (key: TranslationKey, action: string, name: string) =>
      t(key).replace("{action}", t(`act.${action}` as TranslationKey)).replace("{name}", name),
    [t]
  )

  const errorText = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError) {
        if (e.detail.startsWith("permission_denied")) return t("act.permission")
        if (e.detail === "actions_disabled") return t("act.disabled")
        return e.detail
      }
      return String(e)
    },
    [t]
  )

  /** Action Proxmox : lance la tâche, suit son UPID jusqu'à la fin, puis rafraîchit. */
  const guestAction = useCallback(
    async (g: Guest, action: GuestAction) => {
      if (g.type === "docker") return
      const id = toast.loading(fmt("act.pending", action, g.name))
      try {
        const { upid, node } = await api.guestAction(g.host, g.type, g.id, action)
        for (let i = 0; i < 120; i++) {
          const st = await api.taskStatus(node, upid)
          if (!st.running) {
            if (st.ok) toast.success(fmt("act.done", action, g.name), { id })
            else toast.error(fmt("act.failed", action, g.name), { id, description: st.exitstatus })
            break
          }
          await sleep(1000)
        }
      } catch (e) {
        toast.error(fmt("act.failed", action, g.name), { id, description: errorText(e) })
      } finally {
        pollSoon()
      }
    },
    [fmt, errorText, pollSoon]
  )

  const containerAction = useCallback(
    async (g: Guest, action: ContainerAction) => {
      const id = toast.loading(fmt("act.pending", action, g.name))
      try {
        await api.containerAction(g.id, action)
        toast.success(fmt("act.done", action, g.name), { id })
      } catch (e) {
        toast.error(fmt("act.failed", action, g.name), { id, description: errorText(e) })
      } finally {
        pollSoon()
      }
    },
    [fmt, errorText, pollSoon]
  )

  return { guestAction, containerAction }
}
