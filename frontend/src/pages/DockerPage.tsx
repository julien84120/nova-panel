import { Container, Loader2, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { ActionsMenu } from "@/components/infra/ActionsMenu"
import { EmptyRow, GuestStatus, InlineMeter, PageHeader, Toolbar } from "@/components/infra"
import { filterGuests, statusCounts, type StatusFilter } from "@/lib/guests"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDashboard } from "@/hooks/DashboardProvider"
import { useQueryParam } from "@/hooks/useQueryParam"
import { useI18n } from "@/i18n/I18nProvider"
import { api, type Guest } from "@/lib/api"
import { cn, formatBytes, formatUptime, pct } from "@/lib/utils"

export function DockerPage() {
  const { t, lang } = useI18n()
  const { view } = useDashboard()
  const [query, setQuery] = useQueryParam("q")
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [logsFor, setLogsFor] = useState<Guest | null>(null)

  const all = (view?.guests ?? []).filter((g) => g.type === "docker").sort((a, b) => a.name.localeCompare(b.name))
  const rows = filterGuests(all, query, filter)
  const hosts = new Set(all.map((g) => g.host))

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.docker")} subtitle={t("docker.subtitle")} />
      <Card className="gap-0 pb-0">
        <Toolbar query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} counts={statusCounts(all)} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col.name")}</TableHead>
              <TableHead>{t("col.status")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("col.image")}</TableHead>
              {hosts.size > 1 && <TableHead>{t("col.host")}</TableHead>}
              <TableHead className="hidden lg:table-cell">{t("col.ports")}</TableHead>
              <TableHead>{t("col.cpu")}</TableHead>
              <TableHead>{t("col.memory")}</TableHead>
              <TableHead className="hidden xl:table-cell">{t("col.uptime")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!view && <EmptyRow colSpan={9}>{t("common.loading")}</EmptyRow>}
            {view && rows.length === 0 && <EmptyRow colSpan={9}>{t("common.noResults")}</EmptyRow>}
            {rows.map((g) => (
              <TableRow key={`${g.host}-${g.id}`}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Container className="size-3.5" />
                    </span>
                    <div>
                      <div className="max-w-52 truncate font-medium">{g.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{g.id}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <GuestStatus status={g.status} health={g.health} />
                </TableCell>
                <TableCell className="hidden max-w-60 truncate font-mono text-xs text-muted-foreground md:table-cell" title={g.image}>
                  {g.image}
                </TableCell>
                {hosts.size > 1 && <TableCell className="text-muted-foreground">{g.host}</TableCell>}
                <TableCell className="hidden lg:table-cell">
                  <div className="flex max-w-56 flex-wrap gap-1">
                    {g.ports.length === 0 && <span className="text-muted-foreground">—</span>}
                    {g.ports.slice(0, 3).map((p) => (
                      <Badge key={p} variant="outline" className="font-mono text-[10px]">
                        {p}
                      </Badge>
                    ))}
                    {g.ports.length > 3 && <Badge variant="outline">+{g.ports.length - 3}</Badge>}
                  </div>
                </TableCell>
                <TableCell>{g.status === "running" ? <InlineMeter value={g.cpu} className="w-24" /> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  {g.status === "running" && g.mem_total > 0 ? (
                    <InlineMeter value={pct(g.mem_used, g.mem_total)} hint={formatBytes(g.mem_used)} className="w-36" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums xl:table-cell">
                  {g.status === "running" ? formatUptime(g.uptime, lang) : "—"}
                </TableCell>
                <TableCell>
                  <ActionsMenu guest={g} onLogs={() => setLogsFor(g)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <LogsDialog guest={logsFor} onClose={() => setLogsFor(null)} />
    </div>
  )
}

function LogsDialog({ guest, onClose }: { guest: Guest | null; onClose: () => void }) {
  const { t } = useI18n()
  const [logs, setLogs] = useState("")
  const [tail, setTail] = useState(200)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pre = useRef<HTMLPreElement>(null)

  const load = useCallback(async () => {
    if (!guest) return
    setLoading(true)
    try {
      const r = await api.containerLogs(guest.id, tail)
      setLogs(r.logs)
      setError(null)
      requestAnimationFrame(() => pre.current && (pre.current.scrollTop = pre.current.scrollHeight))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [guest, tail])

  useEffect(() => {
    if (!guest) return
    const id = window.setTimeout(load, 0)
    return () => window.clearTimeout(id)
  }, [guest, load])

  return (
    <Dialog open={!!guest} onOpenChange={(o) => !o && (onClose(), setLogs(""))}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{guest && t("docker.logsTitle").replace("{name}", guest.name)}</DialogTitle>
          <DialogDescription className="flex items-center gap-3">
            <span>{t("docker.logsLines")}</span>
            {[100, 200, 500, 1000].map((n) => (
              <button
                key={n}
                onClick={() => setTail(n)}
                className={cn("rounded px-1.5 text-xs", tail === n ? "bg-primary text-primary-foreground" : "hover:text-foreground")}
              >
                {n}
              </button>
            ))}
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t("common.refresh")}
            </Button>
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <pre
          ref={pre}
          className="min-h-[300px] flex-1 overflow-auto rounded-lg border bg-black/40 p-4 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-foreground/85"
        >
          {logs || (loading ? t("common.loading") : "")}
        </pre>
      </DialogContent>
    </Dialog>
  )
}
