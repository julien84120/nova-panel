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

export interface AuthStatus {
  setup_required: boolean
  authenticated: boolean
  user: { username: string } | null
  min_password_length: number
}

export class ApiError extends Error {
  status: number
  detail: string
  retryAfter?: number
  constructor(status: number, detail: string, retryAfter?: number) {
    super(detail)
    this.status = status
    this.detail = detail
    this.retryAfter = retryAfter
  }
}

/** Événement global émis quand la session a expiré (401). */
export const UNAUTHORIZED_EVENT = "nova:unauthorized"

const BASE = import.meta.env.VITE_API_URL ?? ""

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase()
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers as Record<string, string>) }
  if (method !== "GET") {
    headers["X-Nova-Request"] = "1" // protection CSRF exigée par l'API
    if (init.body) headers["Content-Type"] = "application/json"
  }
  const res = await fetch(`${BASE}${path}`, { ...init, method, headers, credentials: "same-origin" })
  if (!res.ok) {
    let detail = res.statusText
    let retryAfter: number | undefined
    try {
      const body = await res.json()
      detail = typeof body.detail === "string" ? body.detail : detail
      retryAfter = body.retry_after
    } catch {
      /* corps non JSON */
    }
    if (res.status === 401 && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw new ApiError(res.status, detail, retryAfter)
  }
  return res.json() as Promise<T>
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  dashboard: () => request<DashboardData>("/api/dashboard"),
  refresh: () => post<DashboardData>("/api/dashboard/refresh"),
  auth: {
    status: () => request<AuthStatus>("/api/auth/status"),
    login: (username: string, password: string) => post<{ username: string }>("/api/auth/login", { username, password }),
    setup: (token: string, username: string, password: string) =>
      post<{ username: string }>("/api/auth/setup", { token, username, password }),
    logout: () => post<{ ok: boolean }>("/api/auth/logout"),
    changePassword: (current_password: string, new_password: string) =>
      post<{ ok: boolean }>("/api/auth/password", { current_password, new_password }),
  },
}
