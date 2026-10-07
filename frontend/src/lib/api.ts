/* Client de l'API NovaPanel (FastAPI). Types alignés sur backend/app/schemas.py. */

export type HostKind = "proxmox" | "docker"
export type HostStatus = "online" | "warning" | "offline"
export type GuestType = "qemu" | "lxc" | "docker"
export type TaskStatus = "ok" | "running" | "error"

export interface Host {
  id: string
  name: string
  kind: HostKind
  address: string
  os: string
  status: HostStatus
  cpu: number
  cores: number
  mem_used: number
  mem_total: number
  disk_used: number
  disk_total: number
  uptime: number
  vms: number
  containers: number
  vms_running: number
  containers_running: number
}

export interface Guest {
  id: string
  name: string
  type: GuestType
  host: string
  status: "running" | "stopped" | "paused" | "unknown"
  cpu: number
  mem_used: number
  mem_total: number
  uptime: number
}

export interface Task {
  id: string
  type: string
  target: string
  host: string
  status: TaskStatus
  started_at: number
  user: string
}

export interface UsagePoint {
  t: number
  cpu: number
  memory: number
}

export interface SourceStatus {
  name: string
  kind: HostKind
  mode: "live" | "demo" | "error"
  detail: string
}

export interface Summary {
  cpu: number
  cores: number
  mem_used: number
  mem_total: number
  disk_used: number
  disk_total: number
  guests_total: number
  guests_running: number
}

export interface DashboardData {
  generated_at: number
  demo: boolean
  sources: SourceStatus[]
  summary: Summary
  hosts: Host[]
  guests: Guest[]
  tasks: Task[]
  history: UsagePoint[]
}

const BASE = import.meta.env.VITE_API_URL ?? ""

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { Accept: "application/json", ...init?.headers } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export const api = {
  dashboard: () => request<DashboardData>("/api/dashboard"),
  refresh: () => request<DashboardData>("/api/dashboard/refresh", { method: "POST" }),
}
