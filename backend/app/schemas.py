"""Modèles de l'API. Les unités sont normalisées : % (0-100), octets, secondes."""

from typing import Literal

from pydantic import BaseModel

HostKind = Literal["proxmox", "docker"]
HostStatus = Literal["online", "warning", "offline"]
GuestType = Literal["qemu", "lxc", "docker"]
TaskStatus = Literal["ok", "running", "error"]
SourceMode = Literal["live", "demo", "error"]


class Host(BaseModel):
    id: str
    name: str
    kind: HostKind
    address: str
    os: str
    status: HostStatus
    cpu: float  # %
    cores: int
    mem_used: int  # octets
    mem_total: int
    disk_used: int
    disk_total: int
    uptime: int  # secondes
    vms: int = 0
    containers: int = 0
    vms_running: int = 0
    containers_running: int = 0


class Guest(BaseModel):
    id: str
    name: str
    type: GuestType
    host: str
    status: Literal["running", "stopped", "paused", "unknown"]
    cpu: float  # % d'un hôte (normalisé sur les vCPU alloués pour Proxmox)
    mem_used: int
    mem_total: int
    uptime: int = 0
    cores: float = 0  # vCPU alloués (Proxmox) ; 0 si inconnu
    disk_total: int = 0
    tags: list[str] = []
    # Docker
    image: str = ""
    ports: list[str] = []
    health: str = ""  # healthy / unhealthy / starting / ""


class Storage(BaseModel):
    id: str
    name: str
    host: str  # nœud, "shared" ou nom de l'hôte Docker
    kind: HostKind
    type: str  # dir, lvmthin, zfspool, nfs, cifs, pbs, rootfs…
    content: list[str] = []
    shared: bool = False
    used: int
    total: int
    status: Literal["available", "unavailable"]


class AuditEntry(BaseModel):
    id: int
    ts: int
    username: str
    source: HostKind
    action: str
    target: str
    status: Literal["ok", "running", "error"]
    detail: str = ""


class Task(BaseModel):
    id: str
    type: str  # ex. vzdump, qmstart, qmigrate
    target: str
    host: str
    status: TaskStatus
    started_at: int  # timestamp unix
    user: str = ""


class UsagePoint(BaseModel):
    t: int  # timestamp unix
    cpu: float
    memory: float


class SourceStatus(BaseModel):
    name: str
    kind: HostKind
    mode: SourceMode
    detail: str = ""


class Summary(BaseModel):
    cpu: float
    cores: int
    mem_used: int
    mem_total: int
    disk_used: int
    disk_total: int
    guests_total: int
    guests_running: int


class Dashboard(BaseModel):
    generated_at: int
    demo: bool
    sources: list[SourceStatus]
    summary: Summary
    hosts: list[Host]
    guests: list[Guest]
    tasks: list[Task]
    storages: list[Storage] = []
    history: list[UsagePoint]
    actions_enabled: bool = True
