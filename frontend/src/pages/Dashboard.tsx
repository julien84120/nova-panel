import { Activity, Cpu, HardDrive, MemoryStick, RefreshCw } from "lucide-react"

import { HostsList } from "@/components/dashboard/HostsList"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { RecentTasks } from "@/components/dashboard/RecentTasks"
import { TopGuests } from "@/components/dashboard/TopGuests"
import { UsageChart } from "@/components/dashboard/UsageChart"
import { Button } from "@/components/ui/button"
import { guests, tasks } from "@/data/mock"
import { useLiveMetrics } from "@/hooks/useLiveMetrics"
import { useI18n } from "@/i18n/I18nProvider"
import { formatBytes } from "@/lib/utils"

export function Dashboard() {
  const { t } = useI18n()
  const { hosts, series } = useLiveMetrics()

  // Agrégats sur l'ensemble des hôtes
  const totalCores = hosts.reduce((s, h) => s + h.cores, 0)
  const cpuPct = Math.round(hosts.reduce((s, h) => s + h.cpu * h.cores, 0) / totalCores)
  const memUsed = hosts.reduce((s, h) => s + h.memUsed, 0)
  const memTotal = hosts.reduce((s, h) => s + h.memTotal, 0)
  const memPct = Math.round((memUsed / memTotal) * 100)
  const diskUsed = hosts.reduce((s, h) => s + h.diskUsed, 0)
  const diskTotal = hosts.reduce((s, h) => s + h.diskTotal, 0)
  const diskPct = Math.round((diskUsed / diskTotal) * 100)
  const guestsTotal = hosts.reduce((s, h) => s + h.vms + h.containers, 0)
  const guestsRunning = guestsTotal - 3

  return (
    <div className="space-y-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("dash.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dash.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" className="bg-card/60">
          <RefreshCw />
          {t("dash.refresh")}
        </Button>
      </div>

      {/* Cartes de métriques */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("dash.cpu")}
          value={`${cpuPct}`}
          unit="%"
          detail={`${totalCores} ${t("dash.cores")} · ${hosts.length} ${t("dash.hosts").toLowerCase()}`}
          icon={Cpu}
          trend={{ value: 4.2, label: t("dash.vsLastHour") }}
          spark={series.map((p) => p.cpu)}
          color="var(--chart-1)"
        />
        <MetricCard
          label={t("dash.memory")}
          value={memUsed.toFixed(1)}
          unit="GiB"
          detail={`${memPct}% ${t("dash.of")} ${formatBytes(memTotal, 0)}`}
          icon={MemoryStick}
          trend={{ value: -1.8, label: t("dash.vsLastHour") }}
          spark={series.map((p) => p.memory)}
          color="var(--chart-2)"
        />
        <MetricCard
          label={t("dash.storage")}
          value={formatBytes(diskUsed).split(" ")[0]}
          unit={formatBytes(diskUsed).split(" ")[1]}
          detail={`${diskPct}% ${t("dash.of")} ${formatBytes(diskTotal)}`}
          icon={HardDrive}
          percent={diskPct}
          color="var(--chart-4)"
        />
        <MetricCard
          label={t("dash.guests")}
          value={`${guestsRunning}`}
          unit={`/ ${guestsTotal}`}
          detail={`${guestsRunning} ${t("dash.running")}`}
          icon={Activity}
          percent={Math.round((guestsRunning / guestsTotal) * 100)}
          color="var(--chart-3)"
          neutralBar
        />
      </div>

      {/* Graphique + hôtes */}
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3 [&>*]:h-full">
          <UsageChart data={series} />
        </div>
        <div className="xl:col-span-2 [&>*]:h-full">
          <TopGuests guests={guests} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3 [&>*]:h-full">
          <RecentTasks tasks={tasks} />
        </div>
        <div className="xl:col-span-2 [&>*]:h-full">
          <HostsList hosts={hosts} />
        </div>
      </div>
    </div>
  )
}
