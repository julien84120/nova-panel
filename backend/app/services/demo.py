"""Données fictives cohérentes (et actions simulées), utilisées quand une source n'est pas configurée."""

from __future__ import annotations

import math
import random
import threading
import time

from app.schemas import Guest, Host, Storage, Task, UsagePoint
from app.services.docker_host import DockerData
from app.services.proxmox import ProxmoxData

GiB = 1024**3
_rng = random.Random()
_lock = threading.Lock()
# Statut modifié par les actions simulées : (type, id) → statut
_overrides: dict[tuple[str, str], str] = {}
_started: dict[tuple[str, str], float] = {}
_demo_tasks: list[Task] = []


def _jitter(v: float, spread: float, lo: float = 2, hi: float = 97) -> float:
    return round(min(hi, max(lo, v + _rng.uniform(-spread, spread))), 1)


# (vmid, nom, type, nœud, cpu%, RAM utilisée GiB, RAM max GiB, vCPU, disque GiB, statut, tags)
_PVE_GUESTS = [
    ("101", "k8s-worker-01", "qemu", "pve-01", 72, 14.2, 16, 8, 120, "running", ["k8s", "prod"]),
    ("102", "win-server-22", "qemu", "pve-01", 33, 9.8, 12, 4, 80, "running", ["windows"]),
    ("103", "home-assistant", "qemu", "pve-01", 9, 2.1, 4, 2, 32, "running", ["domotique"]),
    ("110", "old-ubuntu", "qemu", "pve-01", 0, 0, 4, 2, 32, "stopped", []),
    ("204", "gitlab-runner", "lxc", "pve-02", 47, 5.6, 8, 4, 40, "running", ["ci"]),
    ("205", "pihole", "lxc", "pve-02", 4, 0.4, 1, 1, 8, "running", ["dns"]),
    ("206", "nginx-proxy-manager", "lxc", "pve-02", 6, 0.6, 2, 2, 16, "running", ["web"]),
    ("207", "test-debian", "lxc", "pve-02", 0, 0, 1, 1, 8, "stopped", []),
]

_DOCKER = [
    ("7f3a1c", "postgres-16", "postgres:16-alpine", 58, 3.1, 4, "running", ["5432→5432/tcp"], "healthy"),
    ("91bd02", "nginx-proxy", "nginx:1.27", 12, 0.3, 1, "running", ["80→80/tcp", "443→443/tcp"], ""),
    ("3c5e77", "uptime-kuma", "louislam/uptime-kuma:1", 3, 0.2, 1, "running", ["3001→3001/tcp"], "healthy"),
    ("aa41e9", "grafana", "grafana/grafana:11", 0, 0, 0, "exited", ["3000→3000/tcp"], ""),
]


def _status(key: tuple[str, str], default: str) -> str:
    return _overrides.get(key, default)


def demo_proxmox() -> ProxmoxData:
    now = int(time.time())
    data = ProxmoxData()
    with _lock:
        for vmid, name, gtype, node, cpu, mem, maxmem, cores, disk, st, tags in _PVE_GUESTS:
            status = _status((gtype, vmid), st)
            running = status == "running"
            data.guests.append(
                Guest(
                    id=vmid,
                    name=name,
                    type=gtype,
                    host=node,
                    status=status,
                    cpu=_jitter(cpu, max(2, cpu * 0.12), lo=0.3) if running else 0,
                    mem_used=int((mem or maxmem * 0.25) * GiB) if running else 0,
                    mem_total=int(maxmem * GiB),
                    cores=cores,
                    disk_total=disk * GiB,
                    tags=tags,
                    uptime=int(now - _started.get((gtype, vmid), now - 86400 * 9)) if running else 0,
                )
            )
        tasks = list(_demo_tasks)
    nodes = [
        ("pve-01", "192.168.1.10", 34, 32, 128, 67),
        ("pve-02", "192.168.1.11", 80, 16, 64, 84),
    ]
    for name, addr, cpu, cores, mem, mem_pct in nodes:
        mine = [g for g in data.guests if g.host == name]
        c = _jitter(cpu, 6)
        data.hosts.append(
            Host(
                id=f"pve:{name}",
                name=name,
                kind="proxmox",
                address=addr,
                os="Proxmox VE 9.2.2",
                status="warning" if c >= 85 or mem_pct >= 85 else "online",
                cpu=c,
                cores=cores,
                mem_used=int(_jitter(mem_pct, 2) / 100 * mem * GiB),
                mem_total=mem * GiB,
                disk_used=88 * GiB if name == "pve-01" else 41 * GiB,
                disk_total=220 * GiB if name == "pve-01" else 96 * GiB,
                uptime=(1_987_200 if name == "pve-01" else 604_800) + now % 86400,
                vms=sum(g.type == "qemu" for g in mine),
                containers=sum(g.type == "lxc" for g in mine),
                vms_running=sum(g.type == "qemu" and g.status == "running" for g in mine),
                containers_running=sum(g.type == "lxc" and g.status == "running" for g in mine),
            )
        )
    data.storages = [
        Storage(
            id="storage/pve-01/local",
            name="local",
            host="pve-01",
            kind="proxmox",
            type="dir",
            content=["iso", "vztmpl", "backup"],
            used=38 * GiB,
            total=94 * GiB,
            status="available",
        ),
        Storage(
            id="storage/pve-01/local-lvm",
            name="local-lvm",
            host="pve-01",
            kind="proxmox",
            type="lvmthin",
            content=["images", "rootdir"],
            used=612 * GiB,
            total=1640 * GiB,
            status="available",
        ),
        Storage(
            id="storage/pve-02/local-zfs",
            name="local-zfs",
            host="pve-02",
            kind="proxmox",
            type="zfspool",
            content=["images", "rootdir"],
            used=401 * GiB,
            total=860 * GiB,
            status="available",
        ),
        Storage(
            id="storage/nas-backup",
            name="nas-backup",
            host="shared",
            kind="proxmox",
            type="nfs",
            content=["backup"],
            shared=True,
            used=789 * GiB,
            total=1126 * GiB,
            status="available",
        ),
        Storage(
            id="storage/pbs",
            name="pbs",
            host="shared",
            kind="proxmox",
            type="pbs",
            content=["backup"],
            shared=True,
            used=0,
            total=0,
            status="unavailable",
        ),
    ]
    data.storage_used = sum(s.used for s in data.storages if s.status == "available")
    data.storage_total = sum(s.total for s in data.storages if s.status == "available")
    base = [
        Task(
            id="demo:t1",
            type="vzdump",
            target="VM 101",
            host="pve-01",
            status="running",
            started_at=now - 60,
            user="root@pam",
        ),
        Task(
            id="demo:t3",
            type="qmigrate",
            target="VM 102",
            host="pve-01",
            status="ok",
            started_at=now - 18 * 60,
            user="root@pam",
        ),
        Task(
            id="demo:t5",
            type="qmsnapshot",
            target="VM 103",
            host="pve-01",
            status="ok",
            started_at=now - 75 * 60,
            user="root@pam",
        ),
        Task(
            id="demo:t6",
            type="vzstart",
            target="CT 207",
            host="pve-02",
            status="error",
            started_at=now - 3 * 3600,
            user="root@pam",
        ),
    ]
    data.tasks = sorted(tasks + base, key=lambda t: t.started_at, reverse=True)
    return data


def demo_docker(name: str) -> DockerData:
    now = time.time()
    guests = []
    with _lock:
        for cid, cname, image, cpu, mem, maxmem, st, ports, health in _DOCKER:
            status = _status(("docker", cid), st)
            running = status == "running"
            guests.append(
                Guest(
                    id=cid,
                    name=cname,
                    type="docker",
                    host=name,
                    status="running" if running else ("paused" if status == "paused" else "stopped"),
                    cpu=_jitter(cpu, max(1, cpu * 0.15), lo=0.1) if running else 0,
                    mem_used=int((mem or 0.15) * GiB) if running else 0,
                    mem_total=int(maxmem * GiB),
                    uptime=int(now - _started.get(("docker", cid), now - 3600 * 51)) if running else 0,
                    image=image,
                    ports=ports,
                    health=health if running else "",
                )
            )
    running = sum(g.status == "running" for g in guests)
    host = Host(
        id=f"docker:{name}",
        name=name,
        kind="docker",
        address="oracle (ssh)",
        os="Ubuntu 24.04.3 LTS",
        status="online",
        cpu=_jitter(21, 5),
        cores=4,
        mem_used=int(_jitter(45, 3) / 100 * 24 * GiB),
        mem_total=24 * GiB,
        disk_used=72 * GiB,
        disk_total=194 * GiB,
        uptime=3_456_000,
        containers=len(guests),
        containers_running=running,
    )
    disk = Storage(
        id=f"docker:{name}:/",
        name="/",
        host=name,
        kind="docker",
        type="rootfs",
        content=["docker"],
        used=host.disk_used,
        total=host.disk_total,
        status="available",
    )
    return DockerData(host=host, guests=guests, storages=[disk])


def demo_history(points: int = 60, step: int = 60) -> list[UsagePoint]:
    now = int(time.time())
    out = []
    for i in range(points):
        t = now - (points - 1 - i) * step
        out.append(
            UsagePoint(
                t=t,
                cpu=round(45 + 12 * math.sin(i / 7) + _rng.uniform(-4, 4), 1),
                memory=round(68 + 3 * math.sin(i / 15) + _rng.uniform(-1, 1), 1),
            )
        )
    return out


# ── actions simulées ─────────────────────────────────────────
_RESULT = {
    "start": "running",
    "resume": "running",
    "reboot": "running",
    "restart": "running",
    "unpause": "running",
    "stop": "stopped",
    "shutdown": "stopped",
    "suspend": "paused",
    "pause": "paused",
}


def demo_action(gtype: str, gid: str, node: str, action: str, user: str) -> str:
    key = (gtype, gid)
    with _lock:
        _overrides[key] = _RESULT[action]
        if _RESULT[action] == "running" and action != "unpause":
            _started[key] = time.time()
        upid = f"UPID:{node}:DEMO:{int(time.time() * 1000):X}:{action}:{gid}:{user}:"
        if gtype in ("qemu", "lxc"):
            prefix = "qm" if gtype == "qemu" else "vz"
            _demo_tasks.insert(
                0,
                Task(
                    id=upid,
                    type=f"{prefix}{action}",
                    target=f"{'VM' if gtype == 'qemu' else 'CT'} {gid}",
                    host=node,
                    status="ok",
                    started_at=int(time.time()),
                    user=user,
                ),
            )
            del _demo_tasks[30:]
    return upid


def demo_guest_detail(gtype: str, vmid: str, node: str) -> dict | None:
    data = demo_proxmox()
    g = next((x for x in data.guests if x.type == gtype and x.id == vmid and x.host == node), None)
    if not g:
        return None
    now = int(time.time())
    hist = [
        {
            "t": now - (69 - i) * 60,
            "cpu": round(max(0, g.cpu + 8 * math.sin(i / 5) + _rng.uniform(-3, 3)), 1) if g.status == "running" else 0,
            "memory": round(g.mem_used / g.mem_total * 100 + _rng.uniform(-2, 2), 1)
            if g.mem_total and g.mem_used
            else 0,
            "netin": int(abs(math.sin(i / 3)) * 2e5),
            "netout": int(abs(math.cos(i / 4)) * 9e4),
        }
        for i in range(70)
    ]
    disk_key = "scsi0" if gtype == "qemu" else "rootfs"
    return {
        "vmid": int(vmid),
        "type": gtype,
        "node": node,
        "name": g.name,
        "status": g.status,
        "qmpstatus": g.status,
        "cpu": g.cpu,
        "cpus": g.cores,
        "mem_used": g.mem_used,
        "mem_total": g.mem_total,
        "disk_total": g.disk_total,
        "uptime": g.uptime,
        "ha": False,
        "agent": gtype == "qemu",
        "ostype": "l26" if gtype == "qemu" else "debian",
        "description": "Données de démonstration",
        "tags": g.tags,
        "onboot": True,
        "disks": [{"id": disk_key, "spec": f"local-lvm:vm-{vmid}-disk-0,size={g.disk_total // GiB}G"}],
        "nets": [
            {
                "id": "net0",
                "spec": "virtio=BC:24:11:00:00:01,bridge=vmbr0,firewall=1"
                if gtype == "qemu"
                else "name=eth0,bridge=vmbr0,ip=dhcp,type=veth",
            }
        ],
        "history": hist,
    }


def demo_node_detail(node: str) -> dict | None:
    data = demo_proxmox()
    h = next((x for x in data.hosts if x.name == node), None)
    if not h:
        return None
    now = int(time.time())
    return {
        "node": node,
        "pveversion": "pve-manager/9.2.2",
        "kversion": "Linux 6.17.2-1-pve #1 SMP PREEMPT_DYNAMIC",
        "cpu_model": "AMD Ryzen 9 7950X 16-Core Processor" if h.cores == 32 else "Intel(R) Core(TM) i7-12700",
        "sockets": 1,
        "cores": h.cores // 2,
        "threads": h.cores,
        "loadavg": [round(h.cpu / 10, 2), 3.1, 2.8],
        "cpu": h.cpu,
        "iowait": 0.8,
        "mem_used": h.mem_used,
        "mem_total": h.mem_total,
        "swap_used": 0,
        "swap_total": 8 * GiB,
        "rootfs_used": h.disk_used,
        "rootfs_total": h.disk_total,
        "uptime": h.uptime,
        "history": [
            {
                "t": now - (69 - i) * 60,
                "cpu": round(h.cpu + 10 * math.sin(i / 6) + _rng.uniform(-3, 3), 1),
                "memory": round(h.mem_used / h.mem_total * 100 + _rng.uniform(-1, 1), 1),
                "netin": int(abs(math.sin(i / 3)) * 2e6),
                "netout": int(abs(math.cos(i / 4)) * 1e6),
            }
            for i in range(70)
        ],
    }


def demo_logs(name: str) -> str:
    now = time.time()
    lines = []
    for i in range(40):
        ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(now - (40 - i) * 37))
        lines.append(f"{ts}.000000000Z [{name}] demo log line {i + 1}: request handled in {_rng.randint(2, 90)}ms")
    return "\n".join(lines) + "\n"


def demo_host_history(
    docker_name: str, days: int = 7, step: int = 300
) -> dict[str, list[tuple[str, int, float, float]]]:
    """Historique synthétique distinct par hôte (profil propre à chacun)."""
    now = int(time.time())
    profiles = {"pve:pve-01": (34, 10, 67, 3), "pve:pve-02": (78, 8, 84, 2), f"docker:{docker_name}": (21, 6, 45, 4)}
    out: dict[str, list[tuple[str, int, float, float]]] = {}
    rng = random.Random(42)
    for hid, (cpu, cpu_amp, mem, mem_amp) in profiles.items():
        pts = []
        for t in range(now - days * 86400, now, step):
            day = math.sin((t % 86400) / 86400 * 2 * math.pi - math.pi / 2)  # cycle jour/nuit
            pts.append(
                (
                    hid,
                    t,
                    round(max(1, min(99, cpu + cpu_amp * day + rng.uniform(-4, 4))), 1),
                    round(max(5, min(98, mem + mem_amp * day + rng.uniform(-1, 1))), 1),
                )
            )
        out[hid] = pts
    return out


# ── réseau et sauvegardes fictifs ────────────────────────────
_demo_backups: list[dict] = []


def _stamp(ts: int) -> str:
    return time.strftime("%Y_%m_%d-%H_%M_%S", time.gmtime(ts))


def demo_network(docker_name: str) -> dict:
    data = demo_proxmox()
    interfaces = []
    for node, ip in (("pve-01", "192.168.1.10"), ("pve-02", "192.168.1.11")):
        interfaces += [
            {
                "node": node,
                "iface": "vmbr0",
                "type": "bridge",
                "active": True,
                "autostart": True,
                "method": "static",
                "cidr": f"{ip}/24",
                "gateway": "192.168.1.1",
                "cidr6": "",
                "ports": ["enp3s0"],
                "vlan_aware": True,
                "bond_mode": "",
                "comments": "LAN",
            },
            {
                "node": node,
                "iface": "vmbr1",
                "type": "bridge",
                "active": True,
                "autostart": True,
                "method": "manual",
                "cidr": "",
                "gateway": "",
                "cidr6": "",
                "ports": [],
                "vlan_aware": False,
                "bond_mode": "",
                "comments": "Réseau isolé (lab)",
            },
            {
                "node": node,
                "iface": "enp3s0",
                "type": "eth",
                "active": True,
                "autostart": True,
                "method": "manual",
                "cidr": "",
                "gateway": "",
                "cidr6": "",
                "ports": [],
                "vlan_aware": False,
                "bond_mode": "",
                "comments": "",
            },
            {
                "node": node,
                "iface": "enp4s0",
                "type": "eth",
                "active": False,
                "autostart": False,
                "method": "manual",
                "cidr": "",
                "gateway": "",
                "cidr6": "",
                "ports": [],
                "vlan_aware": False,
                "bond_mode": "",
                "comments": "",
            },
        ]
    nics = []
    for i, g in enumerate(data.guests):
        lab = g.id in ("110", "207")
        nics.append(
            {
                "guest_id": g.id,
                "guest_name": g.name,
                "guest_type": g.type,
                "node": g.host,
                "status": g.status,
                "iface": "net0" if g.type == "qemu" else "eth0",
                "model": "virtio" if g.type == "qemu" else "veth",
                "mac": f"BC:24:11:{i:02X}:3A:{(i * 7) % 256:02X}",
                "bridge": "vmbr1" if lab else "vmbr0",
                "tag": "20" if g.id == "102" else "",
                "firewall": not lab,
                "ip": "dhcp" if g.type == "lxc" else "",
                "rate": "",
                "link_down": False,
            }
        )
    docker = [
        {
            "id": "a1b2c3d4e5f6",
            "name": "proxy",
            "host": docker_name,
            "driver": "bridge",
            "scope": "local",
            "subnet": "172.20.0.0/16",
            "gateway": "172.20.0.1",
            "internal": False,
            "builtin": False,
            "containers": [{"name": "nginx-proxy", "ip": "172.20.0.2"}, {"name": "uptime-kuma", "ip": "172.20.0.3"}],
        },
        {
            "id": "b2c3d4e5f6a1",
            "name": "db",
            "host": docker_name,
            "driver": "bridge",
            "scope": "local",
            "subnet": "172.21.0.0/16",
            "gateway": "172.21.0.1",
            "internal": True,
            "builtin": False,
            "containers": [{"name": "postgres-16", "ip": "172.21.0.2"}],
        },
        {
            "id": "c3d4e5f6a1b2",
            "name": "bridge",
            "host": docker_name,
            "driver": "bridge",
            "scope": "local",
            "subnet": "172.17.0.0/16",
            "gateway": "172.17.0.1",
            "internal": False,
            "builtin": True,
            "containers": [],
        },
        {
            "id": "d4e5f6a1b2c3",
            "name": "host",
            "host": docker_name,
            "driver": "host",
            "scope": "local",
            "subnet": "",
            "gateway": "",
            "internal": False,
            "builtin": True,
            "containers": [],
        },
    ]
    return {"interfaces": interfaces, "guest_nics": nics, "docker_networks": docker}


def demo_backups() -> dict:
    now = int(time.time())
    files = []
    rng = random.Random(7)
    plan = {"101": 7, "102": 7, "103": 7, "204": 7, "205": 3, "206": 7}
    for vmid, n in plan.items():
        g = next(x for x in _PVE_GUESTS if x[0] == vmid)
        for d in range(n):
            ts = now - d * 86400 - 3600 * 3 - rng.randint(0, 900)
            storage = "nas-backup"
            files.append(
                {
                    "volid": f"{storage}:backup/vzdump-{g[2]}-{vmid}-{_stamp(ts)}"
                    f".{'vma' if g[2] == 'qemu' else 'tar'}.zst",
                    "storage": storage,
                    "vmid": vmid,
                    "type": g[2],
                    "size": int(g[8] * 0.35 * GiB * rng.uniform(0.9, 1.1)),
                    "ctime": ts,
                    "format": "vma.zst" if g[2] == "qemu" else "tar.zst",
                    "notes": g[1],
                    "protected": d == 6,
                    "verified": "",
                }
            )
    files[3]["notes"] = "avant mise à jour k8s"
    with _lock:
        files = list(_demo_backups) + files
    jobs = [
        {
            "id": "backup-daily",
            "enabled": True,
            "schedule": "02:30",
            "next_run": now + 6 * 3600,
            "storage": "nas-backup",
            "selection": "101,102,103,204,206",
            "exclude": "",
            "mode": "snapshot",
            "compress": "zstd",
            "node": "",
            "comment": "Quotidienne — production",
            "retention": "keep-daily=7,keep-weekly=4",
        },
        {
            "id": "backup-weekly",
            "enabled": True,
            "schedule": "sun 04:00",
            "next_run": now + 3 * 86400,
            "storage": "nas-backup",
            "selection": "205",
            "exclude": "",
            "mode": "snapshot",
            "compress": "zstd",
            "node": "pve-02",
            "comment": "Hebdomadaire — DNS",
            "retention": "keep-last=3",
        },
        {
            "id": "backup-pbs",
            "enabled": False,
            "schedule": "sat 01:00",
            "next_run": 0,
            "storage": "pbs",
            "selection": "all",
            "exclude": "110,207",
            "mode": "snapshot",
            "compress": "",
            "node": "",
            "comment": "PBS (désactivé : datastore hors ligne)",
            "retention": "",
        },
    ]
    not_backed = [
        {"vmid": "110", "name": "old-ubuntu", "type": "qemu"},
        {"vmid": "207", "name": "test-debian", "type": "lxc"},
    ]
    return {
        "jobs": jobs,
        "files": sorted(files, key=lambda f: f["ctime"], reverse=True),
        "not_backed_up": not_backed,
        "errors": [{"storage": "pbs", "detail": "storage 'pbs' is not online"}],
    }


def demo_backup_now(gtype: str, vmid: str, node: str, storage: str, user: str) -> str:
    g = next(x for x in _PVE_GUESTS if x[0] == vmid)
    ts = int(time.time())
    upid = f"UPID:{node}:DEMO:{ts * 1000:X}:vzdump:{vmid}:{user}:"
    with _lock:
        _demo_backups.insert(
            0,
            {
                "volid": f"{storage}:backup/vzdump-{gtype}-{vmid}-{_stamp(ts)}.zst",
                "storage": storage,
                "vmid": vmid,
                "type": gtype,
                "size": int(g[8] * 0.35 * GiB),
                "ctime": ts,
                "format": "vma.zst" if gtype == "qemu" else "tar.zst",
                "notes": f"NovaPanel: {g[1]}",
                "protected": False,
                "verified": "",
            },
        )
        _demo_tasks.insert(
            0,
            Task(
                id=upid,
                type="vzdump",
                target=f"{'VM' if gtype == 'qemu' else 'CT'} {vmid}",
                host=node,
                status="ok",
                started_at=ts,
                user=user,
            ),
        )
    return upid
