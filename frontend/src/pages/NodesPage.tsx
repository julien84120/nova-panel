import { Cpu, Server } from "lucide-react"
import { useEffect, useState } from "react"

import { HistoryChart, KeyValue, PageHeader, TimeframeToggle } from "@/components/infra"
import { StatusBadge } from "@/components/dashboard/HostsList"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useDashboard } from "@/hooks/DashboardProvider"
import { useI18n } from "@/i18n/I18nProvider"
import { api, type Host, type NodeDetail, type Timeframe } from "@/lib/api"
import { cn, formatBytes, formatUptime, pct } from "@/lib/utils"

export function NodesPage() {
  const { t } = useI18n()
  const { view } = useDashboard()
  const nodes = (view?.hosts ?? []).filter((h) => h.kind === "proxmox")
  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.nodes")} subtitle={t("nodes.subtitle")} />
      {nodes.map((n) => (
        <NodeCard key={n.id} host={n} />
      ))}
    </div>
  )
}

function NodeCard({ host }: { host: Host }) {
  const { t, lang } = useI18n()
  const [tf, setTf] = useState<Timeframe>("hour")
  const [d, setD] = useState<NodeDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const online = host.status !== "offline"

  useEffect(() => {
    if (!online) return
    let cancelled = false
    const load = () =>
      api
        .nodeDetail(host.name, tf)
        .then((r) => !cancelled && (setD(r), setError(null)))
        .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    load()
    const id = window.setInterval(load, 15_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [host.name, tf, online])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Server className="size-4" />
          </span>
          {host.name}
          <StatusBadge status={host.status} />
        </CardTitle>
        <CardDescription>
          {d?.pveversion || host.os} · {host.address} · {t("dash.uptime")} {formatUptime(host.uptime, lang)}
        </CardDescription>
        <CardAction>
          <TimeframeToggle value={tf} onChange={setTf} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Gauge label={t("col.cpu")} value={host.cpu} hint={`${host.cores} ${t("nodes.threads")}`} />
          <Gauge label={t("col.memory")} value={pct(host.mem_used, host.mem_total)} hint={`${formatBytes(host.mem_used)} / ${formatBytes(host.mem_total)}`} />
          <Gauge
            label={t("nodes.rootfs")}
            value={pct(d?.rootfs_used ?? host.disk_used, d?.rootfs_total ?? host.disk_total)}
            hint={`${formatBytes(d?.rootfs_used ?? host.disk_used)} / ${formatBytes(d?.rootfs_total ?? host.disk_total)}`}
          />
          <Gauge
            label={t("nodes.swap")}
            value={pct(d?.swap_used ?? 0, d?.swap_total ?? 0)}
            hint={d ? `${formatBytes(d.swap_used)} / ${formatBytes(d.swap_total)}` : "—"}
          />
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <HistoryChart data={d?.history ?? []} timeframe={tf} height={220} />
            <HistoryChart data={d?.history ?? []} timeframe={tf} network height={140} />
          </div>
          <div className="divide-y self-start rounded-lg border bg-background/40 px-4">
            <KeyValue label={t("nodes.cpuModel")}>
              <span className="inline-flex items-center gap-1.5">
                <Cpu className="size-3.5 text-muted-foreground" />
                {d?.cpu_model || "—"}
              </span>
            </KeyValue>
            <KeyValue label={t("col.cpu")}>{d ? `${d.sockets} × ${d.cores} ${t("nodes.cores")} · ${d.threads} ${t("nodes.threads")}` : "—"}</KeyValue>
            <KeyValue label={t("nodes.load")}>
              <span className="tabular-nums">{d?.loadavg.map((l) => l.toFixed(2)).join(" · ") || "—"}</span>
            </KeyValue>
            <KeyValue label={t("nodes.iowait")}>{d ? `${d.iowait}%` : "—"}</KeyValue>
            <KeyValue label={t("nodes.kernel")}>
              {d?.kversion.split(" #")[0] || "—"}
            </KeyValue>
            <KeyValue label={t("nodes.guests")}>
              {host.vms_running}/{host.vms} VM · {host.containers_running}/{host.containers} LXC
            </KeyValue>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Gauge({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border bg-background/40 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold tabular-nums">{Math.round(value)}%</span>
      </div>
      <Progress
        value={value}
        className="mt-2"
        indicatorClassName={cn(value >= 85 ? "bg-destructive" : value >= 65 ? "bg-warning" : "")}
      />
      <div className="mt-2 truncate text-xs text-muted-foreground">{hint}</div>
    </div>
  )
}
