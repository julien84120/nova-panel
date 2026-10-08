"""Collecte d'un hôte Docker distant via SSH.

- Conteneurs : SDK `docker` (base_url ssh://<alias>), qui réutilise ~/.ssh/config.
- Métriques de l'hôte (CPU, RAM, disque, uptime) : une commande lue dans /proc via paramiko,
  avec le même alias SSH. Une seule configuration SSH à maintenir.
"""

from __future__ import annotations

import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime

import docker
import paramiko

from app.config import Settings
from app.schemas import Guest, Host, Storage

log = logging.getLogger("novapanel.docker")

# Deux lectures de /proc/stat espacées de 0,5 s → CPU instantané
HOST_PROBE = (
    "head -n1 /proc/stat; sleep 0.5; head -n1 /proc/stat; "
    "grep -E '^(MemTotal|MemAvailable):' /proc/meminfo; "
    "df -B1 --output=size,used / | tail -n1; "
    "cut -d' ' -f1 /proc/uptime; nproc; "
    '. /etc/os-release && echo "$PRETTY_NAME"'
)


@dataclass
class HostMetrics:
    cpu: float
    cores: int
    mem_used: int
    mem_total: int
    disk_used: int
    disk_total: int
    uptime: int
    os: str


CONTAINER_ACTIONS = {"start", "stop", "restart", "pause", "unpause"}


@dataclass
class DockerData:
    host: Host | None = None
    guests: list[Guest] = field(default_factory=list)
    storages: list[Storage] = field(default_factory=list)


def parse_ports(attrs: dict) -> list[str]:
    """{'80/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '8080'}]} → ['8080→80/tcp']"""
    out: list[str] = []
    for cport, binds in sorted(((attrs.get("NetworkSettings") or {}).get("Ports") or {}).items()):
        if not binds:
            continue
        for b in binds:
            hp = b.get("HostPort")
            ip = b.get("HostIp", "")
            label = f"{hp}→{cport}" if ip in ("", "0.0.0.0", "::") else f"{ip}:{hp}→{cport}"
            if hp and label not in out:
                out.append(label)
    return out


def started_uptime(attrs: dict, now: float) -> int:
    started = ((attrs.get("State") or {}).get("StartedAt") or "")[:19]
    if not started or started.startswith("0001"):
        return 0
    try:
        ts = datetime.strptime(started, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=UTC).timestamp()
    except ValueError:
        return 0
    return max(0, int(now - ts))


def parse_host_probe(output: str) -> HostMetrics:
    lines = [line.strip() for line in output.strip().splitlines() if line.strip()]
    a = [int(x) for x in lines[0].split()[1:]]
    b = [int(x) for x in lines[1].split()[1:]]
    idle_a, idle_b = a[3] + a[4], b[3] + b[4]  # idle + iowait
    total = sum(b) - sum(a)
    cpu = 0.0 if total <= 0 else (1 - (idle_b - idle_a) / total) * 100
    mem = {}
    for line in lines[2:4]:
        k, v = line.split(":")
        mem[k] = int(v.split()[0]) * 1024
    size, used = (int(x) for x in lines[4].split())
    return HostMetrics(
        cpu=round(cpu, 1),
        cores=int(lines[6]),
        mem_used=mem["MemTotal"] - mem["MemAvailable"],
        mem_total=mem["MemTotal"],
        disk_used=used,
        disk_total=size,
        uptime=int(float(lines[5])),
        os=lines[7] if len(lines) > 7 else "Linux",
    )


def container_cpu_percent(stats: dict) -> float:
    """Même formule que `docker stats` (% d'un cœur × nb de cœurs)."""
    try:
        cpu = stats["cpu_stats"]
        pre = stats["precpu_stats"]
        delta = cpu["cpu_usage"]["total_usage"] - pre["cpu_usage"]["total_usage"]
        sys_delta = cpu.get("system_cpu_usage", 0) - pre.get("system_cpu_usage", 0)
        ncpu = cpu.get("online_cpus") or len(cpu["cpu_usage"].get("percpu_usage") or [1])
        if delta > 0 and sys_delta > 0:
            return round(delta / sys_delta * ncpu * 100, 1)
    except (KeyError, TypeError):
        pass
    return 0.0


def container_mem(stats: dict) -> tuple[int, int]:
    m = stats.get("memory_stats") or {}
    usage = m.get("usage", 0)
    cache = (m.get("stats") or {}).get("inactive_file", 0)  # cgroup v2, comme `docker stats`
    return max(usage - cache, 0), m.get("limit", 0)


class DockerCollector:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.alias = settings.docker_ssh_host
        self._client: docker.DockerClient | None = None
        self._pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="docker-stats")

    @property
    def client(self) -> docker.DockerClient:
        if self._client is None:
            # use_ssh_client=True → utilise le binaire `ssh` et donc ~/.ssh/config (clé, port, user)
            self._client = docker.DockerClient(base_url=f"ssh://{self.alias}", use_ssh_client=True, timeout=15)
        return self._client

    def _ssh_exec(self, command: str) -> str:
        cfg = paramiko.SSHConfig()
        path = os.path.expanduser("~/.ssh/config")
        if os.path.exists(path):
            with open(path) as fh:
                cfg.parse(fh)
        h = cfg.lookup(self.alias)
        client = paramiko.SSHClient()
        client.load_system_host_keys()
        # Refuse les hôtes inconnus : l'empreinte doit déjà être dans known_hosts
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        try:
            client.connect(
                h.get("hostname", self.alias),
                port=int(h.get("port", 22)),
                username=h.get("user"),
                key_filename=h.get("identityfile"),
                timeout=8,
                look_for_keys=True,
            )
            _, stdout, stderr = client.exec_command(command, timeout=10)
            out = stdout.read().decode()
            if stdout.channel.recv_exit_status() != 0:
                raise RuntimeError(stderr.read().decode().strip() or "probe failed")
            return out
        finally:
            client.close()

    def collect(self) -> DockerData:
        name = self.settings.docker_display_name
        metrics = parse_host_probe(self._ssh_exec(HOST_PROBE))
        containers = self.client.containers.list(all=True)
        running = [c for c in containers if c.status == "running"]
        stats = dict(zip([c.id for c in running], self._pool.map(self._stats, running), strict=True))

        guests = []
        now = time.time()
        for c in containers:
            s = stats.get(c.id) or {}
            mem_used, mem_limit = container_mem(s) if s else (0, 0)
            attrs = c.attrs or {}
            state = attrs.get("State") or {}
            guests.append(
                Guest(
                    id=c.short_id,
                    name=c.name,
                    type="docker",
                    host=name,
                    status=c.status if c.status in ("running", "paused") else "stopped",
                    cpu=container_cpu_percent(s) if s else 0.0,
                    mem_used=mem_used,
                    mem_total=mem_limit,
                    uptime=started_uptime(attrs, now) if c.status == "running" else 0,
                    image=(attrs.get("Config") or {}).get("Image", ""),
                    ports=parse_ports(attrs),
                    health=(state.get("Health") or {}).get("Status", ""),
                )
            )

        status = "warning" if metrics.cpu >= 85 or metrics.mem_used / max(metrics.mem_total, 1) >= 0.9 else "online"
        host = Host(
            id=f"docker:{name}",
            name=name,
            kind="docker",
            address=self.alias,
            os=metrics.os,
            status=status,
            cpu=metrics.cpu,
            cores=metrics.cores,
            mem_used=metrics.mem_used,
            mem_total=metrics.mem_total,
            disk_used=metrics.disk_used,
            disk_total=metrics.disk_total,
            uptime=metrics.uptime,
            containers=len(containers),
            containers_running=len(running),
        )
        disk = Storage(
            id=f"docker:{name}:/",
            name="/",
            host=name,
            kind="docker",
            type="rootfs",
            content=["docker"],
            used=metrics.disk_used,
            total=metrics.disk_total,
            status="available",
        )
        return DockerData(host=host, guests=guests, storages=[disk])

    # ── actions ──────────────────────────────────────────────
    def container_action(self, container_id: str, action: str) -> None:
        if action not in CONTAINER_ACTIONS:
            raise ValueError("unsupported_action")
        c = self.client.containers.get(container_id)
        if action == "stop":
            c.stop(timeout=15)
        elif action == "restart":
            c.restart(timeout=15)
        else:
            getattr(c, action)()

    def container_logs(self, container_id: str, tail: int = 200) -> str:
        c = self.client.containers.get(container_id)
        raw = c.logs(tail=max(1, min(tail, 2000)), timestamps=True, stdout=True, stderr=True)
        return raw.decode("utf-8", errors="replace")[-400_000:]

    @staticmethod
    def _stats(container) -> dict:
        try:
            return container.stats(stream=False)
        except Exception as exc:  # noqa: BLE001
            log.debug("stats %s: %s", container.name, exc)
            return {}
