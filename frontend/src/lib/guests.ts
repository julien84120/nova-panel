import type { Guest } from "@/lib/api"

export type StatusFilter = "all" | "running" | "stopped"

export function filterGuests(guests: Guest[], query: string, filter: StatusFilter) {
  const q = query.trim().toLowerCase()
  return guests.filter((g) => {
    if (filter === "running" && g.status !== "running") return false
    if (filter === "stopped" && g.status === "running") return false
    if (!q) return true
    return [g.name, g.id, g.host, g.image, ...g.tags].some((v) => v?.toLowerCase().includes(q))
  })
}

export function statusCounts(guests: Guest[]): Record<StatusFilter, number> {
  const running = guests.filter((g) => g.status === "running").length
  return { all: guests.length, running, stopped: guests.length - running }
}
