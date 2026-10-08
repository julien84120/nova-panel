import { BellOff, Check, RefreshCw, Settings2 } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { SeverityBadge, SeverityIcon } from "@/components/alerts/SeverityBadge"
import { EmptyRow, PageHeader } from "@/components/infra"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAlerts } from "@/hooks/AlertsProvider"
import { usePermissions } from "@/hooks/usePermissions"
import { usePolling } from "@/hooks/usePolling"
import { useI18n } from "@/i18n/I18nProvider"
import { api, type Alert } from "@/lib/api"
import { cn, timeAgo } from "@/lib/utils"

export function AlertsPage() {
  const { t, lang } = useI18n()
  const { active, acknowledge, reload } = useAlerts()
  const [tab, setTab] = useState<"active" | "history">("active")
  const history = usePolling(() => api.alerts("all"), 30_000, [tab, active.length])
  const [busy, setBusy] = useState(false)
  const { canOperate, isAdmin } = usePermissions()

  const rows: Alert[] = tab === "active" ? active : (history.data ?? []).filter((a) => a.resolved_at)

  const evaluate = async () => {
    setBusy(true)
    try {
      await api.alertsEvaluate()
    } finally {
      reload()
      history.reload()
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.alerts")} subtitle={t("alerts.subtitle")}>
        <Button variant="outline" size="sm" className="bg-card/60" onClick={evaluate} disabled={busy || !canOperate}>
          <RefreshCw className={cn(busy && "animate-spin")} />
          {t("alerts.evaluate")}
        </Button>
        {isAdmin && (
          <Button variant="outline" size="sm" className="bg-card/60" asChild>
            <Link to="/settings?tab=alerts">
              <Settings2 />
              {t("alerts.configure")}
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="flex rounded-lg border bg-card/60 p-0.5 text-sm w-fit">
        {(["active", "history"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition-colors",
              tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(k === "active" ? "alerts.active" : "alerts.history")}
            {k === "active" && <span className="ml-1.5 tabular-nums opacity-80">{active.length}</span>}
          </button>
        ))}
      </div>

      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("alerts.severity")}</TableHead>
              <TableHead>{t("alerts.alert")}</TableHead>
              <TableHead>{t(tab === "active" ? "alerts.since" : "alerts.duration")}</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <EmptyRow colSpan={4}>
                <span className="inline-flex flex-col items-center gap-2">
                  <BellOff className="size-5" />
                  {t(tab === "active" ? "alerts.noneActive" : "alerts.noneHistory")}
                </span>
              </EmptyRow>
            )}
            {rows.map((a) => (
              <TableRow key={a.id} className={cn(a.acknowledged && tab === "active" && "opacity-60")}>
                <TableCell>
                  <SeverityBadge severity={a.severity} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex items-start gap-2">
                    <SeverityIcon severity={a.severity} className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <div className="font-medium">{a.title}</div>
                      <div className="text-xs text-muted-foreground">{a.detail}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground" title={new Date(a.started_at * 1000).toLocaleString()}>
                  {tab === "active" ? timeAgo(a.started_at, lang) : duration(a.resolved_at! - a.started_at)}
                </TableCell>
                <TableCell className="text-right">
                  {a.acknowledged ? (
                    <Badge variant="secondary">
                      <Check /> {a.ack_by}
                    </Badge>
                  ) : (
                    tab === "active" && canOperate && (
                      <Button size="sm" variant="ghost" onClick={() => acknowledge(a.id)}>
                        <Check />
                        {t("alerts.ack")}
                      </Button>
                    )
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function duration(s: number) {
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`
  return `${Math.floor(s / 86400)} j ${Math.floor((s % 86400) / 3600)} h`
}
