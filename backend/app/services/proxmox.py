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

    def node_rrd_samples(self, timeframe: str) -> list[tuple[str, int, float, float]]:
        """Points RRD de chaque nœud en ligne : (host_id, t, cpu %, mémoire %)."""
        out = []
        for n in self.api.nodes.get():
            if n.get("status") != "online":
                continue
            for p in self.api.nodes(n["node"]).rrddata.get(timeframe=timeframe, cf="AVERAGE"):
                total = p.get("memtotal") or p.get("maxmem")
                if p.get("cpu") is None or not total:
                    continue
                out.append(
                    (
                        f"pve:{n['node']}",
                        int(p["time"]),
                        round(p["cpu"] * 100, 1),
                        round((p.get("memused") or 0) / total * 100, 1),
                    )
                )
        return out

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

    def guest_backup(self, node: str, vmid: int, storage: str, mode: str) -> str:
        """Sauvegarde immédiate (vzdump) d'un invité → UPID."""
        return self.api.nodes(node).vzdump.post(
            vmid=vmid, storage=storage, mode=mode, compress="zstd", **{"notes-template": "NovaPanel: {{guestname}}"}
        )

    # ── snapshots ────────────────────────────────────────────
    def _guest(self, node: str, gtype: str, vmid: int):
        return getattr(self.api.nodes(node), gtype)(vmid)

    def snapshots(self, node: str, gtype: str, vmid: int) -> list[dict]:
        return [
            normalize_snapshot(x) for x in self._guest(node, gtype, vmid).snapshot.get() if x.get("name") != "current"
        ]

    def all_snapshots(self, guests: list[Guest]) -> list[dict]:
        out = []
        for g in guests:
            if g.type not in ("qemu", "lxc"):
                continue
            try:
                for s in self.snapshots(g.host, g.type, int(g.id)):
                    out.append({**s, "guest_id": g.id, "guest_name": g.name, "guest_type": g.type, "node": g.host})
            except Exception:  # noqa: BLE001 — invité supprimé, droits partiels…
                continue
        return sorted(out, key=lambda s: s["snaptime"], reverse=True)

    def snapshot_create(self, node: str, gtype: str, vmid: int, name: str, description: str, vmstate: bool) -> str:
        params = {"snapname": name, "description": description}
        if gtype == "qemu" and vmstate:
            params["vmstate"] = 1
        return self._guest(node, gtype, vmid).snapshot.post(**params)

    def snapshot_rollback(self, node: str, gtype: str, vmid: int, name: str) -> str:
        return self._guest(node, gtype, vmid).snapshot(name).rollback.post()

    def snapshot_delete(self, node: str, gtype: str, vmid: int, name: str) -> str:
        return self._guest(node, gtype, vmid).snapshot(name).delete()

    # ── réseau ───────────────────────────────────────────────
    def network(self, guests: list[Guest]) -> dict:
        interfaces = []
        for n in self.api.nodes.get():
            if n.get("status") != "online":
                continue
            for i in self.api.nodes(n["node"]).network.get():
                interfaces.append(normalize_iface(n["node"], i))
        nics = []
        for g in guests:
            if g.type not in ("qemu", "lxc"):
                continue
            try:
                cfg = getattr(self.api.nodes(g.host), g.type)(int(g.id)).config.get()
            except Exception:  # noqa: BLE001 — invité supprimé entre-temps, droits partiels…
                continue
            nics += parse_guest_nics(g, cfg)
        return {
            "interfaces": sorted(interfaces, key=lambda i: (i["node"], i["type"] != "bridge", i["iface"])),
            "guest_nics": nics,
        }

    # ── sauvegardes ──────────────────────────────────────────
    def backups(self, storages: list[Storage], guests: list[Guest]) -> dict:
        api = self.api
        jobs = [normalize_job(j) for j in api.cluster.backup.get()]
        try:
            not_backed = [
                {"vmid": str(x.get("vmid")), "name": x.get("name", ""), "type": x.get("type", "")}
                for x in api.cluster("backup-info")("not-backed-up").get()
            ]
        except Exception:  # noqa: BLE001 — endpoint absent sur de vieilles versions
            not_backed = []
        online = [n["node"] for n in api.nodes.get() if n.get("status") == "online"]
        files, errors = [], []
        for st in storages:
            if st.kind != "proxmox" or "backup" not in st.content or st.status != "available" or not online:
                continue
            node = online[0] if st.host == "shared" else st.host
            try:
                for f in api.nodes(node).storage(st.name).content.get(content="backup"):
                    files.append(normalize_backup(st.name, f))
            except Exception as exc:  # noqa: BLE001
                errors.append({"storage": st.name, "detail": str(exc)[:200]})
        return {
            "jobs": jobs,
            "files": sorted(files, key=lambda f: f["ctime"], reverse=True),
            "not_backed_up": not_backed,
            "errors": errors,
        }

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


def _kv(spec: str) -> dict[str, str]:
    out = {}
    for part in spec.split(","):
        k, _, v = part.partition("=")
        out[k.strip()] = v.strip()
    return out


def normalize_snapshot(x: dict) -> dict:
    return {
        "name": x.get("name", ""),
        "description": (x.get("description") or "").strip(),
        "snaptime": int(x.get("snaptime") or 0),
        "vmstate": bool(x.get("vmstate")),
        "parent": x.get("parent", ""),
    }


def normalize_iface(node: str, i: dict) -> dict:
    return {
        "node": node,
        "iface": i.get("iface", ""),
        "type": i.get("type", ""),
        "active": bool(i.get("active")),
        "autostart": bool(i.get("autostart")),
        "method": i.get("method", ""),
        "cidr": i.get("cidr") or (f"{i['address']}/{i.get('netmask', '')}" if i.get("address") else ""),
        "gateway": i.get("gateway", ""),
        "cidr6": i.get("cidr6", ""),
        "ports": (i.get("bridge_ports") or i.get("slaves") or i.get("vlan-raw-device") or "").split(),
        "vlan_aware": bool(i.get("bridge_vlan_aware")),
        "bond_mode": i.get("bond_mode", ""),
        "comments": (i.get("comments") or "").strip(),
    }


def parse_guest_nics(g: Guest, cfg: dict) -> list[dict]:
    nics = []
    for k, v in sorted(cfg.items()):
        if not (k.startswith("net") and k[3:].isdigit() and isinstance(v, str)):
            continue
        kv = _kv(v)
        if g.type == "qemu":
            model = next((m for m in ("virtio", "e1000", "e1000e", "rtl8139", "vmxnet3") if m in kv), "")
            mac = kv.get(model, "")
            ip = ""
            n = int(k[3:])
            ipcfg = cfg.get(f"ipconfig{n}", "")
            if ipcfg:
                ip = _kv(ipcfg).get("ip", "")
        else:
            model, mac, ip = "veth", kv.get("hwaddr", ""), kv.get("ip", "")
        nics.append(
            {
                "guest_id": g.id,
                "guest_name": g.name,
                "guest_type": g.type,
                "node": g.host,
                "status": g.status,
                "iface": kv.get("name", k) if g.type == "lxc" else k,
                "model": model,
                "mac": mac,
                "bridge": kv.get("bridge", ""),
                "tag": kv.get("tag", ""),
                "firewall": kv.get("firewall") == "1",
                "ip": ip,
                "rate": kv.get("rate", ""),
                "link_down": kv.get("link_down") == "1",
            }
        )
    return nics


def normalize_job(j: dict) -> dict:
    if j.get("all"):
        selection = "all"
    elif j.get("pool"):
        selection = f"pool:{j['pool']}"
    else:
        selection = str(j.get("vmid", ""))
    return {
        "id": j.get("id", ""),
        "enabled": str(j.get("enabled", 1)) not in ("0", "False", "false"),
        "schedule": j.get("schedule") or (f"{j.get('dow', '')} {j.get('starttime', '')}".strip()),
        "next_run": int(j.get("next-run") or 0),
        "storage": j.get("storage", ""),
        "selection": selection,
        "exclude": str(j.get("exclude", "")),
        "mode": j.get("mode", "snapshot"),
        "compress": str(j.get("compress", "")),
        "node": j.get("node", ""),
        "comment": j.get("comment", ""),
        "retention": j.get("prune-backups", ""),
    }


def normalize_backup(storage: str, f: dict) -> dict:
    verification = f.get("verification") or {}
    return {
        "volid": f.get("volid", ""),
        "storage": storage,
        "vmid": str(f.get("vmid", "")),
        "type": f.get("subtype") or ("lxc" if "vzdump-lxc" in f.get("volid", "") else "qemu"),
        "size": int(f.get("size") or 0),
        "ctime": int(f.get("ctime") or 0),
        "format": f.get("format", ""),
        "notes": (f.get("notes") or "").strip(),
        "protected": bool(f.get("protected")),
        "verified": verification.get("state", ""),
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
