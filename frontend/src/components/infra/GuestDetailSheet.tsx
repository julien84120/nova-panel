import { useEffect, useState } from "react"

import { ActionsMenu, QuickActions } from "@/components/infra/ActionsMenu"
import { GuestStatus, HistoryChart, KeyValue, TimeframeToggle } from "@/components/infra/index"
import { SnapshotsSection } from "@/components/infra/SnapshotsSection"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useI18n } from "@/i18n/I18nProvider"
import { api, type Guest, type GuestDetail, type Timeframe } from "@/lib/api"
import { formatBytes, formatUptime, pct } from "@/lib/utils"

export function GuestDetailSheet({ guest, onClose }: { guest: Guest | null; onClose: () => void }) {
  const { t, lang } = useI18n()
  const [detail, setDetail] = useState<GuestDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tf, setTf] = useState<Timeframe>("hour")
  const key = guest ? `${guest.host}/${guest.type}/${guest.id}` : null

  useEffect(() => {
    if (!guest || guest.type === "docker") return
    let cancelled = false
    const load = () =>
      api
        .guestDetail(guest.host, guest.type as "qemu" | "lxc", guest.id, tf)
        .then((d) => !cancelled && (setDetail(d), setError(null)))
        .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    load()
    const id = window.setInterval(load, 10_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tf, guest?.status])

  const d = detail && guest && detail.vmid === Number(guest.id) ? detail : null

  return (
    <Sheet open={!!guest} onOpenChange={(o) => !o && (onClose(), setDetail(null))}>
      <SheetContent>
        {guest && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle className="truncate">{guest.name}</SheetTitle>
                <GuestStatus status={guest.status} />
              </div>
              <SheetDescription>
                {guest.type === "qemu" ? "VM" : "CT"} {guest.id} · {guest.host}
                {guest.status === "running" && ` · ${formatUptime(guest.uptime, lang)}`}
              </SheetDescription>
              <div className="mt-3 flex items-center gap-2">
                <QuickActions guest={guest} />
                <ActionsMenu guest={guest} align="start" />
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

              <div className="grid grid-cols-2 gap-4">
                <Stat label={t("col.cpu")} value={`${Math.round(guest.cpu)}%`} sub={`${d?.cpus ?? guest.cores} ${t("guests.vcpu")}`} pct={guest.cpu} />
                <Stat
                  label={t("col.memory")}
                  value={formatBytes(guest.mem_used)}
                  sub={`${t("common.of")} ${formatBytes(guest.mem_total)}`}
                  pct={pct(guest.mem_used, guest.mem_total)}
                />
              </div>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">{t("dash.usage")}</h3>
                  <TimeframeToggle value={tf} onChange={setTf} />
                </div>
                <HistoryChart data={d?.history ?? []} timeframe={tf} />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("guests.network")}</h3>
                <HistoryChart data={d?.history ?? []} timeframe={tf} network height={150} />
              </section>

              <section>
                <h3 className="mb-1 text-sm font-medium">{t("guests.config")}</h3>
                <div className="divide-y rounded-lg border bg-card px-4">
                  <KeyValue label={t("guests.os")}>{d ? (OS_TYPES[d.ostype] ?? d.ostype) || "—" : "—"}</KeyValue>
                  <KeyValue label={t("col.disk")}>{formatBytes(d?.disk_total ?? guest.disk_total)}</KeyValue>
                  <KeyValue label={t("guests.onboot")}>{d ? (d.onboot ? t("common.yes") : t("common.no")) : "—"}</KeyValue>
                  {guest.type === "qemu" && (
                    <KeyValue label={t("guests.agent")}>{d ? (d.agent ? t("common.yes") : t("common.no")) : "—"}</KeyValue>
                  )}
                  {!!guest.tags.length && (
                    <KeyValue label={t("guests.tags")}>
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        {guest.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))}
                      </span>
                    </KeyValue>
                  )}
                </div>
              </section>

              {guest.type !== "docker" && <SnapshotsSection key={`${guest.host}-${guest.id}`} guest={guest} />}

              {d && (d.disks.length > 0 || d.nets.length > 0) && (
                <section className="space-y-3">
                  <SpecList title={t("guests.disks")} items={d.disks} />
                  <Separator />
                  <SpecList title={t("guests.nets")} items={d.nets} />
                </section>
              )}

              {d?.description && (
                <p className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap text-muted-foreground">{d.description}</p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Stat({ label, value, sub, pct: p }: { label: string; value: string; sub: string; pct: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
      <Progress value={Math.min(100, p)} className="mt-3" indicatorClassName={p >= 85 ? "bg-destructive" : p >= 65 ? "bg-warning" : ""} />
    </div>
  )
}

function SpecList({ title, items }: { title: string; items: { id: string; spec: string }[] }) {
  if (!items.length) return null
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.id} className="flex gap-3 rounded-md bg-muted/30 px-3 py-2 font-mono text-xs">
            <span className="w-14 shrink-0 text-primary">{i.id}</span>
            <span className="min-w-0 break-all text-muted-foreground">{i.spec}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const OS_TYPES: Record<string, string> = {
  l26: "Linux (2.6+)",
  l24: "Linux 2.4",
  win11: "Windows 11 / 2022 / 2025",
  win10: "Windows 10 / 2016 / 2019",
  win8: "Windows 8 / 2012",
  win7: "Windows 7 / 2008 R2",
  other: "Other",
  solaris: "Solaris",
  debian: "Debian",
  ubuntu: "Ubuntu",
  alpine: "Alpine",
  centos: "CentOS",
  fedora: "Fedora",
  archlinux: "Arch Linux",
  opensuse: "openSUSE",
  nixos: "NixOS",
  unmanaged: "—",
}
