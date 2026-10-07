import { Boxes, Container, Monitor } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n/I18nProvider"
import type { Guest } from "@/lib/api"
import { cn, formatBytes } from "@/lib/utils"

const typeMeta = {
  qemu: { icon: Monitor, label: "VM" },
  lxc: { icon: Boxes, label: "LXC" },
  docker: { icon: Container, label: "Docker" },
} as const

export function TopGuests({ guests, limit = 6 }: { guests: Guest[]; limit?: number }) {
  const { t } = useI18n()
  const top = guests
    .filter((g) => g.status === "running")
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, limit)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dash.topGuests")}</CardTitle>
        <CardDescription>{t("dash.topGuestsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {top.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("dash.noGuests")}</p>}
        {top.map((g) => {
          const meta = typeMeta[g.type]
          const Icon = meta.icon
          const cpu = Math.min(100, Math.round(g.cpu))
          return (
            <div key={`${g.type}-${g.host}-${g.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{g.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {meta.label} {g.type !== "docker" && `#${g.id}`} · {g.host}
                  {g.mem_used > 0 && ` · ${formatBytes(g.mem_used)}`}
                </div>
              </div>
              <div className="w-24 shrink-0">
                <div className="mb-1 text-right text-xs font-medium tabular-nums">{g.cpu.toFixed(g.cpu < 10 ? 1 : 0)}%</div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700", cpu >= 65 ? "bg-warning" : "bg-primary")}
                    style={{ width: `${Math.max(cpu, 2)}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
