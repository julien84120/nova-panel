"""Données fictives cohérentes, utilisées quand une source n'est pas configurée."""

from __future__ import annotations

import math
import random
import time

from app.schemas import Guest, Host, Task, UsagePoint

GiB = 1024**3
_rng = random.Random()


def _jitter(v: float, spread: float, lo: float = 2, hi: float = 97) -> float:
    return round(min(hi, max(lo, v + _rng.uniform(-spread, spread))), 1)


def demo_proxmox() -> tuple[list[Host], list[Guest], list[Task], int, int]:
    now = int(time.time())
    hosts = [
        Host(
            id="pve:pve-01",
            name="pve-01",
            kind="proxmox",
            address="192.168.1.10",
            os="Proxmox VE 9.2.2",
            status="online",
            cpu=_jitter(34, 6),
            cores=32,
            mem_used=int(_jitter(67, 2) / 100 * 128 * GiB),
            mem_total=128 * GiB,
            disk_used=88 * GiB,
            disk_total=220 * GiB,
            uptime=1_987_200 + now % 86400,
            vms=9,
            containers=6,
            vms_running=8,
            containers_running=5,
        ),
        Host(
            id="pve:pve-02",
            name="pve-02",
            kind="proxmox",
            address="192.168.1.11",
            os="Proxmox VE 9.2.2",
            status="warning",
            cpu=_jitter(80, 5),
            cores=16,
            mem_used=int(_jitter(84, 2) / 100 * 64 * GiB),
            mem_total=64 * GiB,
            disk_used=41 * GiB,
            disk_total=96 * GiB,
            uptime=604_800 + now % 86400,
            vms=5,
            containers=3,
            vms_running=5,
            containers_running=3,
        ),
    ]
    guests = [
        Guest(
            id="101",
            name="k8s-worker-01",
            type="qemu",
            host="pve-01",
            status="running",
            cpu=_jitter(72, 8),
            mem_used=int(14.2 * GiB),
            mem_total=16 * GiB,
            uptime=86400 * 12,
        ),
        Guest(
            id="102",
            name="win-server-22",
            type="qemu",
            host="pve-01",
            status="running",
            cpu=_jitter(33, 6),
            mem_used=int(9.8 * GiB),
            mem_total=12 * GiB,
            uptime=86400 * 3,
        ),
        Guest(
            id="204",
            name="gitlab-runner",
            type="lxc",
            host="pve-02",
            status="running",
            cpu=_jitter(47, 8),
            mem_used=int(5.6 * GiB),
            mem_total=8 * GiB,
            uptime=86400 * 7,
        ),
        Guest(
            id="205",
            name="pihole",
            type="lxc",
            host="pve-02",
            status="running",
            cpu=_jitter(4, 2),
            mem_used=int(0.4 * GiB),
            mem_total=1 * GiB,
            uptime=86400 * 7,
        ),
        Guest(
            id="110",
            name="old-ubuntu",
            type="qemu",
            host="pve-01",
            status="stopped",
            cpu=0,
            mem_used=0,
            mem_total=4 * GiB,
        ),
    ]
    tasks = [
        Task(
            id="t1",
            type="vzdump",
            target="VM 101",
            host="pve-01",
            status="running",
            started_at=now - 60,
            user="root@pam",
        ),
        Task(
            id="t3",
            type="qmigrate",
            target="VM 204",
            host="pve-02",
            status="ok",
            started_at=now - 18 * 60,
            user="root@pam",
        ),
        Task(
            id="t5",
            type="qmsnapshot",
            target="VM 102",
            host="pve-01",
            status="ok",
            started_at=now - 75 * 60,
            user="root@pam",
        ),
        Task(
            id="t6",
            type="vzstart",
            target="CT 205",
            host="pve-02",
            status="error",
            started_at=now - 3 * 3600,
            user="root@pam",
        ),
    ]
    # Compteurs des nœuds cohérents avec la liste d'invités fictive
    for h in hosts:
        mine = [g for g in guests if g.host == h.name]
        h.vms = sum(g.type == "qemu" for g in mine)
        h.containers = sum(g.type == "lxc" for g in mine)
        h.vms_running = sum(g.type == "qemu" and g.status == "running" for g in mine)
        h.containers_running = sum(g.type == "lxc" and g.status == "running" for g in mine)
    return hosts, guests, tasks, 1840 * GiB, 3720 * GiB


def demo_docker(name: str) -> tuple[Host, list[Guest]]:
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
        containers=6,
        containers_running=5,
    )
    guests = [
        Guest(
            id="7f3a1c",
            name="postgres-16",
            type="docker",
            host=name,
            status="running",
            cpu=_jitter(58, 8),
            mem_used=int(3.1 * GiB),
            mem_total=4 * GiB,
        ),
        Guest(
            id="91bd02",
            name="nginx-proxy",
            type="docker",
            host=name,
            status="running",
            cpu=_jitter(12, 4),
            mem_used=int(0.3 * GiB),
            mem_total=1 * GiB,
        ),
        Guest(id="aa41e9", name="grafana", type="docker", host=name, status="stopped", cpu=0, mem_used=0, mem_total=0),
    ]
    return host, guests


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
