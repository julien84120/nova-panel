/* Données fictives du Sprint 1.
   Au Sprint 2, ces structures seront servies par l'API FastAPI
   (proxmoxer pour Proxmox, docker SDK pour Ubuntu). */

export type HostKind = "proxmox" | "docker"
export type HostStatus = "online" | "warning" | "offline"

export interface Host {
  id: string
  name: string
  kind: HostKind
  address: string
  os: string
  status: HostStatus
  cpu: number // %
  cores: number
  memUsed: number // GiB
  memTotal: number // GiB
  diskUsed: number // GiB
  diskTotal: number // GiB
  uptime: number // secondes
  vms: number
  containers: number
}

export type GuestType = "qemu" | "lxc" | "docker"

export interface Guest {
  id: string
  name: string
  type: GuestType
  host: string
  cpu: number
  memUsed: number
  memTotal: number
  status: "running" | "stopped"
}

export interface Task {
  id: string
  label: { fr: string; en: string }
  target: string
  host: string
  status: "ok" | "running" | "error"
  minutesAgo: number
}

export interface UsagePoint {
  time: string
  cpu: number
  memory: number
}

export const hosts: Host[] = [
  {
    id: "pve-01",
    name: "pve-01",
    kind: "proxmox",
    address: "192.168.1.10",
    os: "Proxmox VE 9.0",
    status: "online",
    cpu: 34,
    cores: 32,
    memUsed: 86.4,
    memTotal: 128,
    diskUsed: 1840,
    diskTotal: 3720,
    uptime: 1_987_200,
    vms: 9,
    containers: 6,
  },
  {
    id: "pve-02",
    name: "pve-02",
    kind: "proxmox",
    address: "192.168.1.11",
    os: "Proxmox VE 9.0",
    status: "warning",
    cpu: 78,
    cores: 16,
    memUsed: 54.1,
    memTotal: 64,
    diskUsed: 690,
    diskTotal: 930,
    uptime: 604_800,
    vms: 5,
    containers: 3,
  },
  {
    id: "ubuntu-docker",
    name: "ubuntu-docker",
    kind: "docker",
    address: "10.0.0.24",
    os: "Ubuntu 24.04 LTS",
    status: "online",
    cpu: 21,
    cores: 8,
    memUsed: 11.2,
    memTotal: 32,
    diskUsed: 212,
    diskTotal: 480,
    uptime: 3_456_000,
    vms: 0,
    containers: 14,
  },
]

export const guests: Guest[] = [
  { id: "101", name: "k8s-worker-01", type: "qemu", host: "pve-01", cpu: 72, memUsed: 14.2, memTotal: 16, status: "running" },
  { id: "c-7f3a", name: "postgres-16", type: "docker", host: "ubuntu-docker", cpu: 58, memUsed: 3.1, memTotal: 4, status: "running" },
  { id: "204", name: "gitlab-runner", type: "lxc", host: "pve-02", cpu: 47, memUsed: 5.6, memTotal: 8, status: "running" },
  { id: "102", name: "win-server-22", type: "qemu", host: "pve-01", cpu: 33, memUsed: 9.8, memTotal: 12, status: "running" },
  { id: "c-91bd", name: "nginx-proxy", type: "docker", host: "ubuntu-docker", cpu: 12, memUsed: 0.3, memTotal: 1, status: "running" },
  { id: "205", name: "pihole", type: "lxc", host: "pve-02", cpu: 4, memUsed: 0.4, memTotal: 1, status: "running" },
]

export const tasks: Task[] = [
  { id: "t1", label: { fr: "Sauvegarde vzdump", en: "vzdump backup" }, target: "VM 101", host: "pve-01", status: "running", minutesAgo: 1 },
  { id: "t2", label: { fr: "Démarrage du conteneur", en: "Container start" }, target: "postgres-16", host: "ubuntu-docker", status: "ok", minutesAgo: 6 },
  { id: "t3", label: { fr: "Migration à chaud", en: "Live migration" }, target: "VM 204", host: "pve-02", status: "ok", minutesAgo: 18 },
  { id: "t4", label: { fr: "Pull d'image", en: "Image pull" }, target: "grafana:11", host: "ubuntu-docker", status: "error", minutesAgo: 42 },
  { id: "t5", label: { fr: "Snapshot", en: "Snapshot" }, target: "VM 102", host: "pve-01", status: "ok", minutesAgo: 75 },
]

/** Série temporelle pseudo-aléatoire mais stable (pas de saut au rechargement). */
export function generateUsageSeries(points = 30): UsagePoint[] {
  const now = Date.now()
  let cpu = 38
  let mem = 61
  return Array.from({ length: points }, (_, i) => {
    const seed = Math.sin(i * 1.7) * 10000
    const r = seed - Math.floor(seed)
    cpu = clamp(cpu + (r - 0.5) * 14, 12, 92)
    mem = clamp(mem + (r - 0.48) * 4, 45, 85)
    const t = new Date(now - (points - 1 - i) * 2 * 60_000)
    return {
      time: t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      cpu: Math.round(cpu),
      memory: Math.round(mem),
    }
  })
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}
