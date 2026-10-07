import { Boxes, Container, Monitor } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Guest } from "@/data/mock"
import { useI18n } from "@/i18n/I18nProvider"
import { cn } from "@/lib/utils"

const typeMeta = {
  qemu: { icon: Monitor, label: "VM" },
  lxc: { icon: Boxes, label: "LXC" },
  docker: { icon: Container, label: "Docker" },
} as const

export function TopGuests({ guests }: { guests: Guest[] }) {
  const { t } = useI18n()
  const sorted = [...guests].sort((a, b) => b.cpu - a.cpu)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dash.topGuests")}</CardTitle>
        <CardDescription>{t("dash.topGuestsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {sorted.map((g) => {
          const meta = typeMeta[g.type]
          const Icon = meta.icon
          return (
            <div key={g.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50">
              <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{g.name}</div>
                <div className="text-xs text-muted-foreground">
                  {meta.label} {g.type !== "docker" && `#${g.id}`} · {g.host}
                </div>
              </div>
              <div className="w-24">
                <div className="mb-1 text-right text-xs font-medium tabular-nums">{g.cpu}%</div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", g.cpu >= 65 ? "bg-warning" : "bg-primary")}
                    style={{ width: `${g.cpu}%` }}
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
