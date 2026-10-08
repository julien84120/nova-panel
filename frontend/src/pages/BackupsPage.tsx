import { AlertTriangle, Archive, CalendarClock, CheckCircle2, Database, Lock, ShieldAlert, XCircle } from "lucide-react"
import { useMemo, useState } from "react"

import { BackupDialog } from "@/components/infra/BackupDialog"
import { EmptyRow, PageHeader } from "@/components/infra"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDashboard } from "@/hooks/DashboardProvider"
import { usePolling } from "@/hooks/usePolling"
import { usePermissions } from "@/hooks/usePermissions"
import { useI18n } from "@/i18n/I18nProvider"
import { api, type BackupFile, type Guest } from "@/lib/api"
import { cn, formatBytes, splitBytes, timeAgo } from "@/lib/utils"

const DAY = 86400

export function BackupsPage() {
  const { canOperate } = usePermissions()
  const { t, lang } = useI18n()
  const { view, data: dash } = useDashboard()
  const { data, error } = usePolling(api.backups, 30_000, [dash?.tasks[0]?.id])
  const [backupFor, setBackupFor] = useState<Guest | null>(null)
  // Heure de référence = horodatage du dernier instantané serveur (rendu pur)
  const now = dash?.generated_at ?? 0

  const guests = (view?.guests ?? []).filter((g) => g.type !== "docker").sort((a, b) => Number(a.id) - Number(b.id))
  const files = useMemo(() => data?.files ?? [], [data])
  const byGuest = useMemo(() => {
    const m = new Map<string, BackupFile[]>()
    for (const f of files) m.set(f.vmid, [...(m.get(f.vmid) ?? []), f])
    return m
  }, [files])

  const totalSize = files.reduce((s, f) => s + f.size, 0)
  const last = files[0]
  const failures = (data?.tasks ?? []).filter((x) => x.status === "error" && now - x.started_at < 7 * DAY).length
  const stale = guests.filter((g) => {
    const l = byGuest.get(g.id)?.[0]
    return !l || now - l.ctime > 8 * DAY
  })
  const [sv, su] = splitBytes(totalSize)

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.backups")} subtitle={t("backup.subtitle")} />

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("backup.last")}
          value={last ? timeAgo(last.ctime, lang) : "—"}
          detail={last ? `${guestName(guests, last.vmid)} · ${last.storage}` : t("backup.none")}
          icon={CheckCircle2}
          color="var(--chart-3)"
        />
        <MetricCard label={t("backup.totalSize")} value={sv} unit={su} detail={`${files.length} ${t("backup.files")}`} icon={Database} color="var(--chart-1)" />
        <MetricCard
          label={t("backup.uncovered")}
          value={`${data?.not_backed_up.length ?? "—"}`}
          detail={t("backup.uncoveredHint")}
          icon={ShieldAlert}
          color={data?.not_backed_up.length ? "var(--warning)" : "var(--chart-3)"}
        />
        <MetricCard
          label={t("backup.failures")}
          value={`${failures}`}
          detail={t("backup.failuresHint")}
          icon={XCircle}
          color={failures ? "var(--destructive)" : "var(--chart-3)"}
        />
      </div>

      {(data?.not_backed_up.length ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <div className="font-medium">{t("backup.uncoveredTitle")}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {data!.not_backed_up.map((g) => (
                <Badge key={g.vmid} variant="outline">
                  {g.type === "qemu" ? "VM" : "CT"} {g.vmid} · {g.name}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}
      {data?.errors.map((e) => (
        <div key={e.storage} className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <b>{e.storage}</b> — <span className="font-mono text-xs">{e.detail}</span>
        </div>
      ))}

      {/* Couverture par invité */}
      <Card className="gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle>{t("backup.coverage")}</CardTitle>
          <CardDescription>
            {t("backup.coverageDesc")}
            {stale.length > 0 && ` · ${stale.length} ${t("backup.stale")}`}
          </CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{t("col.id")}</TableHead>
              <TableHead>{t("col.name")}</TableHead>
              <TableHead>{t("backup.lastCol")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("backup.count")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("backup.size")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("backup.storage")}</TableHead>
              <TableHead className="w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data && <EmptyRow colSpan={7}>{t("common.loading")}</EmptyRow>}
            {data &&
              guests.map((g) => {
                const list = byGuest.get(g.id) ?? []
                const l = list[0]
                const age = l ? now - l.ctime : Infinity
                return (
                  <TableRow key={`${g.host}-${g.id}`}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{g.id}</TableCell>
                    <TableCell>
                      <span className="font-medium">{g.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{g.type === "qemu" ? "VM" : "CT"} · {g.host}</span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            age < 1.2 * DAY ? "bg-success" : age < 8 * DAY ? "bg-warning" : "bg-destructive"
                          )}
                        />
                        {l ? timeAgo(l.ctime, lang) : t("backup.never")}
                      </span>
                    </TableCell>
                    <TableCell className="hidden tabular-nums md:table-cell">{list.length}</TableCell>
                    <TableCell className="hidden tabular-nums md:table-cell">{formatBytes(list.reduce((s, f) => s + f.size, 0))}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {[...new Set(list.map((f) => f.storage))].join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setBackupFor(g)} disabled={!canOperate}>
                        <Archive />
                        {t("act.backup")}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      </Card>

      {/* Tâches planifiées */}
      <Card className="gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            {t("backup.jobs")}
          </CardTitle>
          <CardDescription>{t("backup.jobsDesc")}</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("backup.job")}</TableHead>
              <TableHead>{t("backup.schedule")}</TableHead>
              <TableHead>{t("backup.nextRun")}</TableHead>
              <TableHead>{t("backup.selection")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("backup.storage")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("backup.retention")}</TableHead>
              <TableHead>{t("col.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data && data.jobs.length === 0 && <EmptyRow colSpan={7}>{t("backup.noJobs")}</EmptyRow>}
            {data?.jobs.map((j) => (
              <TableRow key={j.id}>
                <TableCell>
                  <div className="font-medium">{j.comment || j.id}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {j.id} · {j.mode}
                    {j.compress && ` · ${j.compress}`}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{j.schedule || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {j.enabled && j.next_run ? new Date(j.next_run * 1000).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" }) : "—"}
                </TableCell>
                <TableCell className="max-w-56 truncate text-xs">
                  {j.selection === "all" ? t("backup.allGuests") : j.selection}
                  {j.exclude && <span className="text-muted-foreground"> · {t("backup.except")} {j.exclude}</span>}
                </TableCell>
                <TableCell className="hidden md:table-cell">{j.storage}</TableCell>
                <TableCell className="hidden font-mono text-[11px] text-muted-foreground lg:table-cell">{j.retention || "—"}</TableCell>
                <TableCell>
                  <Badge variant={j.enabled ? "success" : "secondary"}>{j.enabled ? t("backup.enabled") : t("backup.disabled")}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Fichiers */}
      <Card className="gap-0 pb-0">
        <CardHeader className="pb-4">
          <CardTitle>{t("backup.filesTitle")}</CardTitle>
          <CardDescription>{t("backup.filesDesc")}</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col.name")}</TableHead>
              <TableHead>{t("backup.date")}</TableHead>
              <TableHead>{t("backup.size")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("backup.storage")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("backup.notes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data && files.length === 0 && <EmptyRow colSpan={5}>{t("backup.none")}</EmptyRow>}
            {files.slice(0, 50).map((f) => (
              <TableRow key={f.volid}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{guestName(guests, f.vmid)}</span>
                    <span className="text-xs text-muted-foreground">
                      {f.type === "qemu" ? "VM" : "CT"} {f.vmid}
                    </span>
                    {f.protected && <Lock className="size-3.5 text-warning" aria-label="protected" />}
                    {f.verified === "ok" && <Badge variant="success">✓ verify</Badge>}
                    {f.verified === "failed" && <Badge variant="destructive">verify ✗</Badge>}
                  </div>
                  <div className="max-w-md truncate font-mono text-[11px] text-muted-foreground" title={f.volid}>
                    {f.volid.split("/").pop()}
                  </div>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap" title={new Date(f.ctime * 1000).toLocaleString()}>
                  {new Date(f.ctime * 1000).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" })}
                </TableCell>
                <TableCell className="tabular-nums">{formatBytes(f.size)}</TableCell>
                <TableCell className="hidden md:table-cell">{f.storage}</TableCell>
                <TableCell className="hidden max-w-64 truncate text-xs text-muted-foreground lg:table-cell">{f.notes || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <BackupDialog guest={backupFor} onClose={() => setBackupFor(null)} />
    </div>
  )
}

function guestName(guests: Guest[], vmid: string) {
  return guests.find((g) => g.id === vmid)?.name ?? vmid
}
