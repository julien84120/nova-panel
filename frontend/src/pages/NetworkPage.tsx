import { Cable, Container, Network, Shield } from "lucide-react"
import { useState } from "react"

import { EmptyRow, PageHeader } from "@/components/infra"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useDashboard } from "@/hooks/DashboardProvider"
import { usePolling } from "@/hooks/usePolling"
import { useQueryParam } from "@/hooks/useQueryParam"
import { useI18n } from "@/i18n/I18nProvider"
import { api, type GuestNic, type NetIface } from "@/lib/api"
import { cn } from "@/lib/utils"

const TYPE_VARIANT: Record<string, "default" | "secondary" | "outline" | "warning"> = {
  bridge: "default",
  bond: "warning",
  eth: "secondary",
  vlan: "outline",
  OVSBridge: "default",
}

export function NetworkPage() {
  const { t } = useI18n()
  const { selectedHost, data: dash } = useDashboard()
  const [tab, setTab] = useState<"proxmox" | "docker">("proxmox")
  const [query, setQuery] = useQueryParam("q")
  const { data, error } = usePolling(api.network, 60_000, [])

  const hostName = selectedHost === "all" ? null : dash?.hosts.find((h) => h.id === selectedHost)?.name
  const ifaces = (data?.interfaces ?? []).filter((i) => !hostName || i.node === hostName)
  const nics = (data?.guest_nics ?? []).filter((n) => !hostName || n.node === hostName)
  const nodes = [...new Set(ifaces.map((i) => i.node))]
  const q = query.trim().toLowerCase()
  const nicRows = nics.filter((n) => !q || [n.guest_name, n.guest_id, n.bridge, n.mac, n.ip, n.tag].some((v) => v.toLowerCase().includes(q)))

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.network")} subtitle={t("net.subtitle")}>
        <div className="flex rounded-lg border bg-card/60 p-0.5 text-sm">
          {(["proxmox", "docker"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {k === "proxmox" ? "Proxmox" : "Docker"}
            </button>
          ))}
        </div>
      </PageHeader>

      {(error || (data?.errors.length ?? 0) > 0) && (
        <div className="space-y-1 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          {error && <div>{error}</div>}
          {data?.errors.map((e) => (
            <div key={e.source}>
              <b>{e.source}</b> — <span className="font-mono text-xs">{e.detail}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "proxmox" ? (
        <>
          {!data && <Card className="h-48 animate-pulse bg-card/60" />}
          {nodes.map((node) => (
            <NodeInterfaces key={node} node={node} ifaces={ifaces.filter((i) => i.node === node)} nics={nics.filter((n) => n.node === node)} />
          ))}

          <Card className="gap-0 pb-0">
            <CardHeader className="pb-4">
              <CardTitle>{t("net.guestNics")}</CardTitle>
              <CardDescription>{t("net.guestNicsDesc")}</CardDescription>
            </CardHeader>
            <div className="px-5 pb-4">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("common.search")}
                className="h-9 w-full max-w-xs rounded-lg border border-input bg-background/40 px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col.name")}</TableHead>
                  <TableHead>{t("net.iface")}</TableHead>
                  <TableHead>{t("net.bridge")}</TableHead>
                  <TableHead>VLAN</TableHead>
                  <TableHead className="hidden md:table-cell">MAC</TableHead>
                  <TableHead className="hidden lg:table-cell">IP</TableHead>
                  <TableHead>{t("net.firewall")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data && nicRows.length === 0 && <EmptyRow colSpan={7}>{t("common.noResults")}</EmptyRow>}
                {nicRows.map((n) => (
                  <TableRow key={`${n.node}-${n.guest_id}-${n.iface}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", n.status === "running" ? "bg-success" : "bg-muted-foreground/40")} />
                        <span className="font-medium">{n.guest_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {n.guest_type === "qemu" ? "VM" : "CT"} {n.guest_id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {n.iface} <span className="text-muted-foreground">({n.model})</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">
                        {n.bridge || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{n.tag || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{n.mac}</TableCell>
                    <TableCell className="hidden font-mono text-xs lg:table-cell">{n.ip || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      {n.firewall ? (
                        <Badge variant="success">
                          <Shield /> {t("common.yes")}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("common.no")}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      ) : (
        <DockerNetworks networks={data?.docker_networks ?? []} loading={!data} />
      )}
    </div>
  )
}

function NodeInterfaces({ node, ifaces, nics }: { node: string; ifaces: NetIface[]; nics: GuestNic[] }) {
  const { t } = useI18n()
  const bridges = ifaces.filter((i) => i.type === "bridge" || i.type === "OVSBridge")
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Network className="size-4 text-primary" />
          {node}
        </CardTitle>
        <CardDescription>{t("net.nodeDesc").replace("{n}", String(ifaces.length))}</CardDescription>
      </CardHeader>

      {bridges.length > 0 && (
        <CardContent className="grid gap-3 pb-5 md:grid-cols-2 xl:grid-cols-3">
          {bridges.map((b) => {
            const attached = nics.filter((n) => n.bridge === b.iface)
            return (
              <div key={b.iface} className="rounded-lg border bg-background/40 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Cable className="size-4 text-primary" />
                    <span className="font-mono font-medium">{b.iface}</span>
                    {b.vlan_aware && <Badge variant="outline">VLAN aware</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{b.cidr || t("net.noIp")}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {b.ports.length ? `${t("net.ports")} : ${b.ports.join(", ")}` : t("net.noPorts")}
                  {b.comments && ` · ${b.comments}`}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {attached.length === 0 && <span className="text-xs text-muted-foreground">{t("net.noGuests")}</span>}
                  {attached.map((n) => (
                    <span
                      key={`${n.guest_id}-${n.iface}`}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-0.5 text-xs"
                      title={`${n.iface} · ${n.mac}`}
                    >
                      <span className={cn("size-1.5 rounded-full", n.status === "running" ? "bg-success" : "bg-muted-foreground/40")} />
                      {n.guest_name}
                      {n.tag && <span className="font-mono text-[10px] text-primary">vlan {n.tag}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </CardContent>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("net.iface")}</TableHead>
            <TableHead>{t("col.type")}</TableHead>
            <TableHead>{t("col.status")}</TableHead>
            <TableHead>{t("net.address")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("net.gateway")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("net.members")}</TableHead>
            <TableHead className="hidden xl:table-cell">{t("net.comment")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ifaces.map((i) => (
            <TableRow key={i.iface}>
              <TableCell className="font-mono font-medium">{i.iface}</TableCell>
              <TableCell>
                <Badge variant={TYPE_VARIANT[i.type] ?? "outline"}>{i.type}</Badge>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className={cn("size-2 rounded-full", i.active ? "bg-success" : "bg-muted-foreground/40")} />
                  {i.active ? t("net.active") : t("net.inactive")}
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {i.cidr || <span className="text-muted-foreground">{i.method || "—"}</span>}
                {i.cidr6 && <div className="text-muted-foreground">{i.cidr6}</div>}
              </TableCell>
              <TableCell className="hidden font-mono text-xs md:table-cell">{i.gateway || "—"}</TableCell>
              <TableCell className="hidden font-mono text-xs lg:table-cell">
                {i.ports.join(", ") || "—"}
                {i.bond_mode && <span className="ml-1 text-muted-foreground">({i.bond_mode})</span>}
              </TableCell>
              <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">{i.comments || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function DockerNetworks({ networks, loading }: { networks: import("@/lib/api").DockerNetwork[]; loading: boolean }) {
  const { t } = useI18n()
  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("col.name")}</TableHead>
            <TableHead>{t("net.driver")}</TableHead>
            <TableHead>{t("net.subnet")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("net.gateway")}</TableHead>
            <TableHead>{t("net.containers")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && <EmptyRow colSpan={5}>{t("common.loading")}</EmptyRow>}
          {!loading && networks.length === 0 && <EmptyRow colSpan={5}>{t("common.noResults")}</EmptyRow>}
          {networks.map((n) => (
            <TableRow key={n.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Container className="size-4 text-muted-foreground" />
                  <span className={cn("font-medium", n.builtin && "text-muted-foreground")}>{n.name}</span>
                  {n.internal && <Badge variant="warning">{t("net.internal")}</Badge>}
                  {n.builtin && <Badge variant="outline">{t("net.builtin")}</Badge>}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{n.driver}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{n.subnet || "—"}</TableCell>
              <TableCell className="hidden font-mono text-xs md:table-cell">{n.gateway || "—"}</TableCell>
              <TableCell>
                <div className="flex max-w-md flex-wrap gap-1.5">
                  {n.containers.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                  {n.containers.map((c) => (
                    <span key={c.name} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-0.5 text-xs">
                      {c.name}
                      {c.ip && <span className="font-mono text-[10px] text-muted-foreground">{c.ip}</span>}
                    </span>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
