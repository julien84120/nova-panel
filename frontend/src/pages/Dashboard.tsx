import { Activity, Cpu, HardDrive, MemoryStick, RefreshCw } from "lucide-react"
import { useState } from "react"

import { HostsList } from "@/components/dashboard/HostsList"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { RecentTasks } from "@/components/dashboard/RecentTasks"
import { ApiErrorBanner, SourceAlerts } from "@/components/dashboard/SourceAlerts"
import { TopGuests } from "@/components/dashboard/TopGuests"
import { ResourceChart } from "@/components/dashboard/ResourceChart"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useDashboard } from "@/hooks/DashboardProvider"
import { usePolling } from "@/hooks/usePolling"
import { useI18n } from "@/i18n/I18nProvider"
import { api, type HistoryRange, type UsagePoint } from "@/lib/api"
import { cn, formatBytes, pct, splitBytes } from "@/lib/utils"

/** Variation (en points de %) entre le début et la fin de la fenêtre d'historique. */
function trendOf(history: UsagePoint[], key: "cpu" | "memory") {
  if (history.length < 10) return undefined
  const avg = (pts: UsagePoint[]) => pts.reduce((s, p) => s + p[key], 0) / pts.length
  return +(avg(history.slice(-5)) - avg(history.slice(0, 5))).toFixed(1)
}

export function Dashboard() {
  const { t } = useI18n()
  const { view, data, error, loading, refresh, refreshing, selectedHost } = useDashboard()
  const [range, setRange] = useState<HistoryRange>("hour")
  const hostFilter = selectedHost === "all" ? undefined : selectedHost
  // Historique par hôte (base locale du serveur) — distinct pour chaque machine
  const metrics = usePolling(() => api.metricsHistory(range, hostFilter), range === "hour" ? 15_000 : 60_000, [range, hostFilter])
  const series = metrics.data?.hosts ?? []

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("dash.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("dash.subtitle")}</p>
      </div>
      <Button variant="outline" size="sm" className="bg-card/60" onClick={refresh} disabled={refreshing || loading}>
        <RefreshCw className={cn(refreshing && "animate-spin")} />
        {t("dash.refresh")}
      </Button>
    </div>
  )

  if (!view) {
    return (
      <div className="space-y-6">
        {header}
        {error && <ApiErrorBanner message={error} />}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-[158px] animate-pulse bg-card/60" />
          ))}
        </div>
        <Card className="h-[360px] animate-pulse bg-card/60" />
      </div>
    )
  }

  const s = view.summary
  // Mini-graphes des cartes : agrégat global, ou l'historique de l'hôte sélectionné (dernière heure)
  const history: UsagePoint[] =
    selectedHost === "all" ? view.history : range === "hour" ? (series.find((h) => h.id === selectedHost)?.points ?? []) : []
  const [diskV, diskU] = splitBytes(s.disk_used)
  const [memV, memU] = splitBytes(s.mem_used)
  const running = view.guests.filter((g) => g.status === "running")
  const countType = (type: string) => running.filter((g) => g.type === type).length

  return (
    <div className="space-y-6">
      {header}
      {error && <ApiErrorBanner message={error} />}
      {data && <SourceAlerts sources={data.sources} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("dash.cpu")}
          value={s.cpu < 10 ? s.cpu.toFixed(1) : `${Math.round(s.cpu)}`}
          unit="%"
          detail={`${s.cores} ${t("dash.cores")} · ${view.hosts.length} ${t(view.hosts.length > 1 ? "dash.hostsCount" : "dash.hostCount")}`}
          icon={Cpu}
          trend={(() => {
            const v = trendOf(history, "cpu")
            return v === undefined ? undefined : { value: v, label: t("dash.vsLastHour") }
          })()}
          spark={history.length > 1 ? history.map((p) => p.cpu) : undefined}
          percent={history.length > 1 ? undefined : Math.round(s.cpu)}
          color="var(--chart-1)"
        />
        <MetricCard
          label={t("dash.memory")}
          value={memV}
          unit={memU}
          detail={`${pct(s.mem_used, s.mem_total)}% ${t("dash.of")} ${formatBytes(s.mem_total, 0)}`}
          icon={MemoryStick}
          trend={(() => {
            const v = trendOf(history, "memory")
            return v === undefined ? undefined : { value: v, label: t("dash.vsLastHour") }
          })()}
          spark={history.length > 1 ? history.map((p) => p.memory) : undefined}
          percent={history.length > 1 ? undefined : pct(s.mem_used, s.mem_total)}
          color="var(--chart-2)"
        />
        <MetricCard
          label={t("dash.storage")}
          value={diskV}
          unit={diskU}
          detail={`${pct(s.disk_used, s.disk_total)}% ${t("dash.of")} ${formatBytes(s.disk_total)}`}
          icon={HardDrive}
          percent={pct(s.disk_used, s.disk_total)}
          color="var(--chart-4)"
        />
        <MetricCard
          label={t("dash.guests")}
          value={`${s.guests_running}`}
          unit={`/ ${s.guests_total}`}
          detail={`${countType("qemu")} VM · ${countType("lxc")} LXC · ${countType("docker")} Docker`}
          icon={Activity}
          percent={pct(s.guests_running, s.guests_total)}
          color="var(--chart-3)"
          neutralBar
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3 [&>*]:h-full">
          <ResourceChart series={series} single={!!hostFilter} range={range} onRange={setRange} loading={!metrics.data} />
        </div>
        <div className="xl:col-span-2 [&>*]:h-full">
          <TopGuests guests={view.guests} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3 [&>*]:h-full">
          <RecentTasks tasks={view.tasks} />
        </div>
        <div className="xl:col-span-2 [&>*]:h-full">
          <HostsList hosts={view.hosts} />
        </div>
      </div>
    </div>
  )
}
