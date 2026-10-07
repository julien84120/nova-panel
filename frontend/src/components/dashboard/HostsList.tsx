import { Container, Server } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { Host } from "@/data/mock"
import { useI18n } from "@/i18n/I18nProvider"
import { cn, formatUptime } from "@/lib/utils"

export function HostsList({ hosts }: { hosts: Host[] }) {
  const { t, lang } = useI18n()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dash.hosts")}</CardTitle>
        <CardDescription>{t("dash.hostsDesc")}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" className="text-primary">
            {t("dash.viewAll")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {hosts.map((h) => {
          const memPct = Math.round((h.memUsed / h.memTotal) * 100)
          const Icon = h.kind === "proxmox" ? Server : Container
          return (
            <div key={h.id} className="rounded-lg border bg-background/40 p-3.5 transition-colors hover:border-primary/30">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{h.name}</span>
                    <StatusBadge status={h.status} />
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {h.os} · {h.address}
                  </div>
                </div>
                <div className="hidden text-right text-xs sm:block">
                  <div className="text-muted-foreground">{t("dash.uptime")}</div>
                  <div className="font-medium tabular-nums">{formatUptime(h.uptime, lang)}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <Meter label={t("dash.cpu")} value={h.cpu} hint={`${h.cores} ${t("dash.cores")}`} />
                <Meter label={t("dash.memory")} value={memPct} hint={`${h.memUsed.toFixed(0)}/${h.memTotal} GiB`} />
              </div>
              <div className="mt-2.5 flex gap-3 text-[11px] text-muted-foreground">
                {h.kind === "proxmox" && (
                  <span>
                    <b className="font-medium text-foreground">{h.vms}</b> {t("dash.vmsShort")}
                  </span>
                )}
                <span>
                  <b className="font-medium text-foreground">{h.containers}</b> {t("dash.containers")}
                </span>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="font-medium">{value}%</span>
          <span className="ml-1 text-muted-foreground">{hint}</span>
        </span>
      </div>
      <Progress
        value={value}
        indicatorClassName={cn(value >= 85 ? "bg-destructive" : value >= 65 ? "bg-warning" : "")}
      />
    </div>
  )
}

export function StatusBadge({ status }: { status: Host["status"] }) {
  const { t } = useI18n()
  const map = {
    online: { v: "success", l: t("dash.online") },
    warning: { v: "warning", l: t("dash.warning") },
    offline: { v: "destructive", l: t("dash.offline") },
  } as const
  const s = map[status]
  return (
    <Badge variant={s.v} className="gap-1.5 px-1.5 py-0 text-[10px]">
      <span className="size-1.5 rounded-full bg-current" />
      {s.l}
    </Badge>
  )
}
