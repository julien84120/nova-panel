import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { useEffect, useState } from "react"

import { EmptyRow, PageHeader } from "@/components/infra"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDashboard } from "@/hooks/DashboardProvider"
import { useI18n } from "@/i18n/I18nProvider"
import type { TranslationKey } from "@/i18n/translations"
import { api, type AuditEntry, type TaskStatus } from "@/lib/api"
import { taskLabel } from "@/lib/labels"
import { cn, timeAgo } from "@/lib/utils"

export function TasksPage() {
  const { t, lang } = useI18n()
  const { view, data } = useDashboard()
  const [tab, setTab] = useState<"proxmox" | "audit">("proxmox")
  const [audit, setAudit] = useState<AuditEntry[] | null>(null)

  useEffect(() => {
    if (tab !== "audit") return
    let cancelled = false
    const load = () => api.audit(200).then((a) => !cancelled && setAudit(a)).catch(() => undefined)
    load()
    const id = window.setInterval(load, 5000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [tab, data?.generated_at])

  const tasks = view?.tasks ?? []

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.tasks")} subtitle={t("tasks.subtitle")}>
        <div className="flex rounded-lg border bg-card/60 p-0.5 text-sm">
          {(["proxmox", "audit"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(k === "proxmox" ? "tasks.proxmox" : "tasks.audit")}
            </button>
          ))}
        </div>
      </PageHeader>

      <Card className="gap-0 py-0">
        {tab === "proxmox" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.action")}</TableHead>
                <TableHead>{t("col.target")}</TableHead>
                <TableHead>{t("col.node")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("col.user")}</TableHead>
                <TableHead>{t("col.status")}</TableHead>
                <TableHead className="text-right">{t("col.started")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.length === 0 && <EmptyRow colSpan={6}>{view ? t("dash.noTasks") : t("common.loading")}</EmptyRow>}
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">{taskLabel(task.type, lang)}</TableCell>
                  <TableCell className="font-mono text-xs">{task.target}</TableCell>
                  <TableCell className="text-muted-foreground">{task.host}</TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{task.user}</TableCell>
                  <TableCell>
                    <ResultBadge status={task.status} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground" title={new Date(task.started_at * 1000).toLocaleString()}>
                    {timeAgo(task.started_at, lang)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.action")}</TableHead>
                <TableHead>{t("col.target")}</TableHead>
                <TableHead>{t("col.user")}</TableHead>
                <TableHead>{t("col.result")}</TableHead>
                <TableHead className="text-right">{t("col.started")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit === null && <EmptyRow colSpan={5}>{t("common.loading")}</EmptyRow>}
              {audit?.length === 0 && <EmptyRow colSpan={5}>{t("tasks.auditEmpty")}</EmptyRow>}
              {audit?.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {a.source === "proxmox" ? "PVE" : "Docker"}
                      </Badge>
                      <span className="font-medium">{t(`act.${a.action}` as TranslationKey)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-72 truncate text-sm">{a.target}</TableCell>
                  <TableCell className="text-muted-foreground">{a.username}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ResultBadge status={a.status} />
                      {a.detail && a.status === "error" && (
                        <span className="max-w-64 truncate font-mono text-xs text-muted-foreground" title={a.detail}>
                          {a.detail}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground" title={new Date(a.ts * 1000).toLocaleString()}>
                    {timeAgo(a.ts, lang)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

function ResultBadge({ status }: { status: TaskStatus }) {
  const { t } = useI18n()
  if (status === "ok")
    return (
      <Badge variant="success">
        <CheckCircle2 /> {t("task.ok")}
      </Badge>
    )
  if (status === "running")
    return (
      <Badge>
        <Loader2 className="animate-spin" /> {t("task.running")}
      </Badge>
    )
  return (
    <Badge variant="destructive">
      <XCircle /> {t("task.error")}
    </Badge>
  )
}
