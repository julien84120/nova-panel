import { Pause, Play, Power, PowerOff, RotateCw, Square } from "lucide-react"
import type { ComponentType } from "react"

import type { TranslationKey } from "@/i18n/translations"
import type { ContainerAction, Guest, GuestAction } from "@/lib/api"

export type AnyAction = GuestAction | ContainerAction
export interface ActionDef {
  action: AnyAction
  icon: ComponentType<{ className?: string }>
  confirm?: TranslationKey
  destructive?: boolean
}

/** Actions proposées selon le type d'invité et son état. */
export function availableActions(g: Guest): ActionDef[] {
  const start: ActionDef = { action: "start", icon: Play }
  if (g.type === "docker") {
    if (g.status === "running")
      return [
        { action: "restart", icon: RotateCw, confirm: "act.confirm.restart" },
        { action: "pause", icon: Pause, confirm: "act.confirm.pause" },
        { action: "stop", icon: Square, confirm: "act.confirm.dockerStop", destructive: true },
      ]
    if (g.status === "paused")
      return [{ action: "unpause", icon: Play }, { action: "stop", icon: Square, confirm: "act.confirm.dockerStop", destructive: true }]
    return [start]
  }
  if (g.status === "running") {
    const list: ActionDef[] = [
      { action: "shutdown", icon: Power, confirm: "act.confirm.shutdown" },
      { action: "reboot", icon: RotateCw, confirm: "act.confirm.reboot" },
    ]
    if (g.type === "qemu") list.push({ action: "suspend", icon: Pause, confirm: "act.confirm.suspend" })
    list.push({ action: "stop", icon: PowerOff, confirm: "act.confirm.stop", destructive: true })
    return list
  }
  if (g.status === "paused")
    return [{ action: "resume", icon: Play }, { action: "stop", icon: PowerOff, confirm: "act.confirm.stop", destructive: true }]
  return [start]
}

