"""Collecte Proxmox VE via proxmoxer (jeton API, lecture seule)."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

from proxmoxer import ProxmoxAPI

from app.config import Settings
from app.schemas import Guest, Host, Task, UsagePoint

log = logging.getLogger("novapanel.proxmox")


@dataclass
class ProxmoxData:
    hosts: list[Host] = field(default_factory=list)
    guests: list[Guest] = field(default_factory=list)
    tasks: list[Task] = field(default_factory=list)
    storage_used: int = 0
    storage_total: int = 0


class ProxmoxCollector:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._api: ProxmoxAPI | None = None
        self._versions: dict[str, str] = {}

    @property
    def api(self) -> ProxmoxAPI:
        if self._api is None:
            s = self.settings
            if not s.proxmox_verify_ssl:
                import urllib3

                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            self._api = ProxmoxAPI(
                s.proxmox_host,
                port=s.proxmox_port,
                user=s.proxmox_user,
                token_name=s.proxmox_token_name,
                token_value=s.proxmox_token_secret,
                verify_ssl=s.proxmox_verify_ssl,
                timeout=8,
            )
        return self._api

    def collect(self) -> ProxmoxData:
        api = self.api
        resources = api.cluster.resources.get()
        tasks_raw = api.cluster.tasks.get()
        return build_proxmox_data(resources, tasks_raw, self._node_version, self.settings.proxmox_host)

    def _node_version(self, node: str) -> str:
        if node not in self._versions:
            try:
                v = self.api.nodes(node).version.get()
                self._versions[node] = f"Proxmox VE {v.get('version', '')}".strip()
            except Exception:  # noqa: BLE001 — l'info de version est facultative
                self._versions[node] = "Proxmox VE"
        return self._versions[node]

    def history(self) -> list[UsagePoint]:
        """Historique CPU/RAM agrégé de l'heure passée (RRD Proxmox), pour amorcer le graphique."""
        api = self.api
        nodes = [n for n in api.nodes.get() if n.get("status") == "online"]
        series: dict[int, list[tuple[float, float, float, float]]] = {}
        for n in nodes:
            maxcpu = n.get("maxcpu") or 1
            for p in api.nodes(n["node"]).rrddata.get(timeframe="hour", cf="AVERAGE"):
                if p.get("cpu") is None or not p.get("maxmem"):
                    continue
                series.setdefault(int(p["time"]), []).append(
                    (p["cpu"] * maxcpu, maxcpu, p.get("memused", 0), p["maxmem"])
                )
        points = []
        for t in sorted(series):
            rows = series[t]
            if len(rows) != len(nodes):
                continue
            cores = sum(r[1] for r in rows)
            mem_total = sum(r[3] for r in rows)
            points.append(
                UsagePoint(
                    t=t,
                    cpu=round(sum(r[0] for r in rows) / cores * 100, 1),
                    memory=round(sum(r[2] for r in rows) / mem_total * 100, 1),
                )
            )
        return points


def build_proxmox_data(resources: list[dict], tasks_raw: list[dict], version_of, address: str) -> ProxmoxData:
    """Transforme /cluster/resources et /cluster/tasks en modèles NovaPanel (fonction pure, testable)."""
    data = ProxmoxData()
    nodes = [r for r in resources if r.get("type") == "node"]
    vms = [r for r in resources if r.get("type") in ("qemu", "lxc") and not r.get("template")]
    storages = [r for r in resources if r.get("type") == "storage" and r.get("status") == "available"]

    for r in vms:
        running = r.get("status") == "running"
        data.guests.append(
            Guest(
                id=str(r.get("vmid")),
                name=r.get("name") or f"{r['type']}-{r.get('vmid')}",
                type=r["type"],
                host=r.get("node", ""),
                status=r.get("status") if r.get("status") in ("running", "stopped", "paused") else "unknown",
                cpu=round((r.get("cpu") or 0) * 100, 1) if running else 0.0,
                mem_used=int(r.get("mem") or 0) if running else 0,
                mem_total=int(r.get("maxmem") or 0),
                uptime=int(r.get("uptime") or 0),
            )
        )

    for n in nodes:
        name = n["node"]
        online = n.get("status") == "online"
        node_guests = [g for g in data.guests if g.host == name]
        cpu = round((n.get("cpu") or 0) * 100, 1)
        mem_pct = (n.get("mem") or 0) / (n.get("maxmem") or 1) * 100
        status = "offline" if not online else ("warning" if cpu >= 85 or mem_pct >= 90 else "online")
        data.hosts.append(
            Host(
                id=f"pve:{name}",
                name=name,
                kind="proxmox",
                address=address if len(nodes) == 1 else name,
                os=version_of(name) if online else "Proxmox VE",
                status=status,
                cpu=cpu if online else 0,
                cores=int(n.get("maxcpu") or 0),
                mem_used=int(n.get("mem") or 0),
                mem_total=int(n.get("maxmem") or 0),
                disk_used=int(n.get("disk") or 0),
                disk_total=int(n.get("maxdisk") or 0),
                uptime=int(n.get("uptime") or 0),
                vms=sum(g.type == "qemu" for g in node_guests),
                containers=sum(g.type == "lxc" for g in node_guests),
                vms_running=sum(g.type == "qemu" and g.status == "running" for g in node_guests),
                containers_running=sum(g.type == "lxc" and g.status == "running" for g in node_guests),
            )
        )

    # Stockage : un stockage partagé apparaît une fois par nœud → on le compte une seule fois
    seen: set[str] = set()
    for s in storages:
        key = s.get("storage", "") if s.get("shared") else s.get("id", "")
        if key in seen:
            continue
        seen.add(key)
        data.storage_used += int(s.get("disk") or 0)
        data.storage_total += int(s.get("maxdisk") or 0)

    for t in sorted(tasks_raw, key=lambda x: x.get("starttime", 0), reverse=True)[:8]:
        if "endtime" not in t or t.get("status") in (None, ""):
            status = "running"
        elif t.get("status") == "OK":
            status = "ok"
        else:
            status = "error"
        data.tasks.append(
            Task(
                id=t.get("upid", ""),
                type=t.get("type", "task"),
                target=_task_target(t),
                host=t.get("node", ""),
                status=status,
                started_at=int(t.get("starttime") or time.time()),
                user=t.get("user", ""),
            )
        )
    return data


def _task_target(t: dict) -> str:
    tid = t.get("id") or ""
    typ = t.get("type", "")
    if tid and typ.startswith(("qm", "vz")) and tid.isdigit():
        return f"{'CT' if typ.startswith('vz') and typ != 'vzdump' else 'VM'} {tid}"
    return tid or t.get("node", "")
