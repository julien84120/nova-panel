"""Collecte et actions Proxmox VE via proxmoxer (jeton API)."""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field

from proxmoxer import ProxmoxAPI

from app.config import Settings
from app.schemas import Guest, Host, Storage, Task, UsagePoint

log = logging.getLogger("novapanel.proxmox")

GUEST_ACTIONS = {
    "qemu": {"start", "shutdown", "stop", "reboot", "suspend", "resume"},
    "lxc": {"start", "shutdown", "stop", "reboot"},
}
NODE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$")


def valid_upid(upid: str) -> bool:
    return upid.startswith("UPID:") and len(upid) < 256 and "/" not in upid and ".." not in upid


@dataclass
class ProxmoxData:
    hosts: list[Host] = field(default_factory=list)
    guests: list[Guest] = field(default_factory=list)
    tasks: list[Task] = field(default_factory=list)
    storages: list[Storage] = field(default_factory=list)
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

    # ── collecte périodique ──────────────────────────────────
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

    # ── détails à la demande ─────────────────────────────────
    def node_detail(self, node: str, timeframe: str = "hour") -> dict:
        n = self.api.nodes(node)
        st = n.status.get()
        rrd = n.rrddata.get(timeframe=timeframe, cf="AVERAGE")
        cpuinfo = st.get("cpuinfo", {})
        return {
            "node": node,
            "pveversion": st.get("pveversion", ""),
            "kversion": st.get("kversion", ""),
            "cpu_model": cpuinfo.get("model", ""),
            "sockets": cpuinfo.get("sockets", 0),
            "cores": cpuinfo.get("cores", 0),
            "threads": cpuinfo.get("cpus", 0),
            "loadavg": [float(x) for x in st.get("loadavg", [])],
            "cpu": round((st.get("cpu") or 0) * 100, 1),
            "iowait": round((st.get("wait") or 0) * 100, 1),
            "mem_used": st.get("memory", {}).get("used", 0),
            "mem_total": st.get("memory", {}).get("total", 0),
            "swap_used": st.get("swap", {}).get("used", 0),
            "swap_total": st.get("swap", {}).get("total", 0),
            "rootfs_used": st.get("rootfs", {}).get("used", 0),
            "rootfs_total": st.get("rootfs", {}).get("total", 0),
            "uptime": st.get("uptime", 0),
            "history": rrd_points(rrd, mem_key="memused", maxmem_key="memtotal"),
        }

    def guest_detail(self, node: str, gtype: str, vmid: int, timeframe: str = "hour") -> dict:
        g = getattr(self.api.nodes(node), gtype)(vmid)
        st = g.status.current.get()
        cfg = g.config.get()
        rrd = g.rrddata.get(timeframe=timeframe, cf="AVERAGE")
        return build_guest_detail(gtype, vmid, node, st, cfg, rrd)

    # ── actions ──────────────────────────────────────────────
    def guest_action(self, node: str, gtype: str, vmid: int, action: str) -> str:
        """Lance l'action et renvoie l'UPID de la tâche Proxmox."""
        if action not in GUEST_ACTIONS.get(gtype, set()):
            raise ValueError("unsupported_action")
        status = getattr(self.api.nodes(node), gtype)(vmid).status
        return getattr(status, action).post()

    def task_status(self, node: str, upid: str) -> dict:
        st = self.api.nodes(node).tasks(upid).status.get()
        log_lines = []
        if st.get("status") == "stopped":
            try:
                log_lines = [x.get("t", "") for x in self.api.nodes(node).tasks(upid).log.get(limit=50)]
            except Exception:  # noqa: BLE001
                pass
        return {
            "upid": upid,
            "running": st.get("status") == "running",
            "ok": st.get("exitstatus") == "OK" if st.get("status") == "stopped" else None,
            "exitstatus": st.get("exitstatus", ""),
            "log": log_lines,
        }


def rrd_points(rrd: list[dict], mem_key: str = "mem", maxmem_key: str = "maxmem") -> list[dict]:
    out = []
    for p in rrd:
        if p.get("cpu") is None:
            continue
        maxmem = p.get(maxmem_key) or 0
        out.append(
            {
                "t": int(p["time"]),
                "cpu": round(p["cpu"] * 100, 1),
                "memory": round((p.get(mem_key) or 0) / maxmem * 100, 1) if maxmem else 0,
                "netin": round(p.get("netin") or 0),
                "netout": round(p.get("netout") or 0),
            }
        )
    return out


def build_guest_detail(gtype: str, vmid: int, node: str, st: dict, cfg: dict, rrd: list[dict]) -> dict:
    disks, nets = [], []
    for k, v in sorted(cfg.items()):
        if not isinstance(v, str):
            continue
        if re.match(r"^(scsi|virtio|sata|ide|efidisk|tpmstate)\d+$|^rootfs$|^mp\d+$", k) and "media=cdrom" not in v:
            disks.append({"id": k, "spec": v})
        elif re.match(r"^net\d+$", k):
            nets.append({"id": k, "spec": v})
    running = st.get("status") == "running"
    return {
        "vmid": vmid,
        "type": gtype,
        "node": node,
        "name": st.get("name") or cfg.get("name") or cfg.get("hostname") or str(vmid),
        "status": st.get("status", "unknown"),
        "qmpstatus": st.get("qmpstatus", ""),
        "cpu": round((st.get("cpu") or 0) * 100, 1) if running else 0,
        "cpus": st.get("cpus") or cfg.get("cores") or 0,
        "mem_used": st.get("mem", 0) if running else 0,
        "mem_total": st.get("maxmem", 0),
        "disk_total": st.get("maxdisk", 0),
        "uptime": st.get("uptime", 0),
        "ha": (st.get("ha") or {}).get("managed", 0) == 1,
        "agent": bool(cfg.get("agent", "0").startswith("1")) if isinstance(cfg.get("agent"), str) else False,
        "ostype": cfg.get("ostype", ""),
        "description": cfg.get("description", ""),
        "tags": [t for t in re.split(r"[;, ]", cfg.get("tags", "")) if t],
        "onboot": str(cfg.get("onboot", "0")) == "1",
        "disks": disks,
        "nets": nets,
        "history": rrd_points(rrd),
    }


def build_proxmox_data(resources: list[dict], tasks_raw: list[dict], version_of, address: str) -> ProxmoxData:
    """Transforme /cluster/resources et /cluster/tasks en modèles NovaPanel (fonction pure, testable)."""
    data = ProxmoxData()
    nodes = [r for r in resources if r.get("type") == "node"]
    vms = [r for r in resources if r.get("type") in ("qemu", "lxc") and not r.get("template")]
    storages = [r for r in resources if r.get("type") == "storage"]

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
                cores=float(r.get("maxcpu") or 0),
                disk_total=int(r.get("maxdisk") or 0),
                tags=[t for t in re.split(r"[;, ]", r.get("tags") or "") if t],
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
        shared = bool(s.get("shared"))
        key = s.get("storage", "") if shared else s.get("id", "")
        if key in seen:
            continue
        seen.add(key)
        available = s.get("status") == "available"
        data.storages.append(
            Storage(
                id=s.get("id", key),
                name=s.get("storage", key),
                host="shared" if shared else s.get("node", ""),
                kind="proxmox",
                type=s.get("plugintype", ""),
                content=[c for c in (s.get("content") or "").split(",") if c],
                shared=shared,
                used=int(s.get("disk") or 0),
                total=int(s.get("maxdisk") or 0),
                status="available" if available else "unavailable",
            )
        )
        if available:
            data.storage_used += int(s.get("disk") or 0)
            data.storage_total += int(s.get("maxdisk") or 0)

    for t in sorted(tasks_raw, key=lambda x: x.get("starttime", 0), reverse=True)[:50]:
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
