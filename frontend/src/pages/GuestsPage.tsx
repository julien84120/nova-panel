import { Boxes, Monitor } from "lucide-react"
import { useState } from "react"

import { ActionsMenu } from "@/components/infra/ActionsMenu"
import { GuestDetailSheet } from "@/components/infra/GuestDetailSheet"
import { EmptyRow, GuestStatus, InlineMeter, PageHeader, Toolbar } from "@/components/infra"
import { filterGuests, statusCounts, type StatusFilter } from "@/lib/guests"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDashboard } from "@/hooks/DashboardProvider"
import { useQueryParam } from "@/hooks/useQueryParam"
import { useI18n } from "@/i18n/I18nProvider"
import type { Guest } from "@/lib/api"
import { formatBytes, formatUptime, pct } from "@/lib/utils"

export function GuestsPage({ type }: { type: "qemu" | "lxc" }) {
  const { t, lang } = useI18n()
  const { view } = useDashboard()
  const [query, setQuery] = useQueryParam("q")
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [selected, setSelected] = useState<{ host: string; id: string } | null>(null)

  const all = (view?.guests ?? []).filter((g) => g.type === type).sort((a, b) => Number(a.id) - Number(b.id))
  const rows = filterGuests(all, query, filter)
  // Toujours la version la plus récente de l'invité sélectionné (statut à jour après une action)
  const current = selected ? (all.find((g) => g.host === selected.host && g.id === selected.id) ?? null) : null
  const Icon = type === "qemu" ? Monitor : Boxes

  return (
    <div className="space-y-6">
      <PageHeader title={t(type === "qemu" ? "nav.vms" : "nav.lxc")} subtitle={t(type === "qemu" ? "guests.vmSubtitle" : "guests.lxcSubtitle")} />
      <Card className="gap-0 pb-0">
        <Toolbar query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} counts={statusCounts(all)} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{t("col.id")}</TableHead>
              <TableHead>{t("col.name")}</TableHead>
              <TableHead>{t("col.status")}</TableHead>
              <TableHead>{t("col.node")}</TableHead>
              <TableHead>{t("col.cpu")}</TableHead>
              <TableHead>{t("col.memory")}</TableHead>
              <TableHead className="hidden xl:table-cell">{t("col.disk")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("col.uptime")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!view && <EmptyRow colSpan={9}>{t("common.loading")}</EmptyRow>}
            {view && rows.length === 0 && <EmptyRow colSpan={9}>{t("common.noResults")}</EmptyRow>}
            {rows.map((g: Guest) => (
              <TableRow key={`${g.host}-${g.id}`} className="cursor-pointer" onClick={() => setSelected({ host: g.host, id: g.id })}>
                <TableCell className="font-mono text-xs text-muted-foreground">{g.id}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="max-w-56 truncate font-medium">{g.name}</div>
                      {g.tags.length > 0 && (
                        <div className="mt-0.5 flex gap-1">
                          {g.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <GuestStatus status={g.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{g.host}</TableCell>
                <TableCell>
                  {g.status === "running" ? <InlineMeter value={g.cpu} hint={`${g.cores} vCPU`} className="w-28" /> : <Dash />}
                </TableCell>
                <TableCell>
                  {g.status === "running" ? (
                    <InlineMeter value={pct(g.mem_used, g.mem_total)} hint={`${formatBytes(g.mem_used, 1)} / ${formatBytes(g.mem_total, 0)}`} className="w-40" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{formatBytes(g.mem_total, 0)}</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground xl:table-cell">{formatBytes(g.disk_total, 0)}</TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                  {g.status === "running" ? formatUptime(g.uptime, lang) : "—"}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <ActionsMenu guest={g} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <GuestDetailSheet guest={current} onClose={() => setSelected(null)} />
    </div>
  )
}

const Dash = () => <span className="text-muted-foreground">—</span>
