import { Camera, Cpu, History, Trash2 } from "lucide-react"
import { useState } from "react"

import { DeleteSnapshotDialog, RollbackDialog } from "@/components/infra/SnapshotsSection"
import { EmptyRow, PageHeader } from "@/components/infra"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDashboard } from "@/hooks/DashboardProvider"
import { usePolling } from "@/hooks/usePolling"
import { useQueryParam } from "@/hooks/useQueryParam"
import { useI18n } from "@/i18n/I18nProvider"
import { api, type Guest, type GuestSnapshot } from "@/lib/api"
import { cn, timeAgo } from "@/lib/utils"

const DAY = 86400

export function SnapshotsPage() {
  const { t, lang } = useI18n()
  const { view, data: dash } = useDashboard()
  const { data, error, reload } = usePolling(api.snapshots, 60_000, [])
  const [query, setQuery] = useQueryParam("q")
  const [oldOnly, setOldOnly] = useState(false)
  const [rollback, setRollback] = useState<GuestSnapshot | null>(null)
  const [del, setDel] = useState<GuestSnapshot | null>(null)
  const now = dash?.generated_at ?? 0
  const enabled = dash?.actions_enabled ?? true
  const maxAge = 30 * DAY

  const hostName = view && view.hosts.length === 1 ? view.hosts[0].name : null
  const all = (data ?? []).filter((s) => !hostName || s.node === hostName)
  const q = query.trim().toLowerCase()
  const rows = all.filter(
    (s) =>
      (!oldOnly || now - s.snaptime > maxAge) &&
      (!q || [s.name, s.guest_name, s.guest_id, s.description].some((v) => v.toLowerCase().includes(q)))
  )
  const old = all.filter((s) => now - s.snaptime > maxAge).length
  const withRam = all.filter((s) => s.vmstate).length
  const guestOf = (s: GuestSnapshot | null): Guest | null =>
    s ? (view?.guests.find((g) => g.type === s.guest_type && g.id === s.guest_id && g.host === s.node) ?? null) : null

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.snapshots")} subtitle={t("snap.subtitle")} />
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label={t("snap.total")} value={`${all.length}`} detail={`${new Set(all.map((s) => s.guest_id)).size} ${t("snap.guests")}`} icon={Camera} color="var(--chart-1)" />
        <MetricCard
          label={t("snap.old")}
          value={`${old}`}
          detail={t("snap.oldHint")}
          icon={History}
          color={old ? "var(--warning)" : "var(--chart-3)"}
        />
        <MetricCard label={t("snap.withRam")} value={`${withRam}`} detail={t("snap.withRamHint")} icon={Cpu} color="var(--chart-5)" />
      </div>

      <Card className="gap-0 pb-0">
        <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search")}
            className="h-9 w-full max-w-xs rounded-lg border border-input bg-background/40 px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="accent-[var(--primary)]" checked={oldOnly} onChange={(e) => setOldOnly(e.target.checked)} />
            {t("snap.oldOnly")}
          </label>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("snap.name")}</TableHead>
              <TableHead>{t("snap.guestCol")}</TableHead>
              <TableHead>{t("snap.age")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("snap.description")}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data && !error && <EmptyRow colSpan={5}>{t("common.loading")}</EmptyRow>}
            {data && rows.length === 0 && <EmptyRow colSpan={5}>{t("snap.noneAll")}</EmptyRow>}
            {rows.map((s) => {
              const age = now - s.snaptime
              return (
                <TableRow key={`${s.node}-${s.guest_id}-${s.name}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{s.name}</span>
                      {s.vmstate && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Cpu className="size-3" /> RAM
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{s.guest_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {s.guest_type === "qemu" ? "VM" : "CT"} {s.guest_id} · {s.node}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center gap-1.5 text-sm", age > maxAge && "text-warning")}>
                      <span className={cn("size-2 rounded-full", age > maxAge ? "bg-warning" : "bg-success")} />
                      {timeAgo(s.snaptime, lang)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-72 truncate text-sm text-muted-foreground lg:table-cell">{s.description || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="size-8" title={t("snap.rollback")} disabled={!enabled} onClick={() => setRollback(s)}>
                      <History />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive hover:text-destructive"
                      title={t("snap.delete")}
                      disabled={!enabled}
                      onClick={() => setDel(s)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
      {guestOf(rollback) && <RollbackDialog guest={guestOf(rollback)!} snapshot={rollback} onClose={() => setRollback(null)} onDone={reload} />}
      {guestOf(del) && <DeleteSnapshotDialog guest={guestOf(del)!} snapshot={del} onClose={() => setDel(null)} onDone={reload} />}
    </div>
  )
}
