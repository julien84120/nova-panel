import { Database, HardDrive, Share2 } from "lucide-react"

import { EmptyRow, InlineMeter, PageHeader } from "@/components/infra"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDashboard } from "@/hooks/DashboardProvider"
import { useI18n } from "@/i18n/I18nProvider"
import { STORAGE_TYPES } from "@/lib/labels"
import { formatBytes, pct, splitBytes } from "@/lib/utils"

export function StoragePage() {
  const { t } = useI18n()
  const { view } = useDashboard()
  const storages = [...(view?.storages ?? [])].sort((a, b) => a.kind.localeCompare(b.kind) || a.host.localeCompare(b.host) || a.name.localeCompare(b.name))
  const avail = storages.filter((s) => s.status === "available" && s.total > 0)
  const used = avail.reduce((s, x) => s + x.used, 0)
  const total = avail.reduce((s, x) => s + x.total, 0)
  const [uv, uu] = splitBytes(used)
  const [fv, fu] = splitBytes(total - used)

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.storage")} subtitle={t("storage.subtitle")} />
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label={t("storage.total")} value={splitBytes(total)[0]} unit={splitBytes(total)[1]} detail={`${avail.length} / ${storages.length} ${t("status.available").toLowerCase()}`} icon={Database} color="var(--chart-1)" />
        <MetricCard label={t("storage.used")} value={uv} unit={uu} detail={`${pct(used, total)}%`} icon={HardDrive} percent={pct(used, total)} color="var(--chart-4)" />
        <MetricCard label={t("storage.free")} value={fv} unit={fu} detail={`${100 - pct(used, total)}%`} icon={HardDrive} color="var(--chart-3)" />
      </div>
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col.name")}</TableHead>
              <TableHead>{t("col.host")}</TableHead>
              <TableHead>{t("col.type")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("col.content")}</TableHead>
              <TableHead>{t("col.usage")}</TableHead>
              <TableHead>{t("col.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {storages.length === 0 && <EmptyRow colSpan={6}>{view ? t("common.noResults") : t("common.loading")}</EmptyRow>}
            {storages.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      {s.shared ? <Share2 className="size-3.5" /> : <HardDrive className="size-3.5" />}
                    </span>
                    <span className="font-medium">{s.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {s.shared ? <Badge variant="outline">{t("storage.shared")}</Badge> : s.host}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{STORAGE_TYPES[s.type] ?? s.type}</Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {s.content.map((c) => (
                      <span key={c} className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {c}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {s.total > 0 ? (
                    <InlineMeter value={pct(s.used, s.total)} hint={`${formatBytes(s.used)} / ${formatBytes(s.total)}`} className="w-52" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={s.status === "available" ? "success" : "destructive"}>
                    {t(s.status === "available" ? "status.available" : "status.unavailable")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
