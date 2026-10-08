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
  cores: number
  disk_total: number
  tags: string[]
  image: string
  ports: string[]
  health: string
}

export interface Storage {
  id: string
  name: string
  host: string
  kind: HostKind
  type: string
  content: string[]
  shared: boolean
  used: number
  total: number
  status: "available" | "unavailable"
}

export interface AuditEntry {
  id: number
  ts: number
  username: string
  source: HostKind
  action: string
  target: string
  status: TaskStatus
  detail: string
}

export interface HistoryPoint {
  t: number
  cpu: number
  memory: number
  netin: number
  netout: number
}

export type Timeframe = "hour" | "day" | "week" | "month"

export interface NodeDetail {
  node: string
  pveversion: string
  kversion: string
  cpu_model: string
  sockets: number
  cores: number
  threads: number
  loadavg: number[]
  cpu: number
  iowait: number
  mem_used: number
  mem_total: number
  swap_used: number
  swap_total: number
  rootfs_used: number
  rootfs_total: number
  uptime: number
  history: HistoryPoint[]
}

export interface GuestDetail {
  vmid: number
  type: "qemu" | "lxc"
  node: string
  name: string
  status: string
  qmpstatus: string
  cpu: number
  cpus: number
  mem_used: number
  mem_total: number
  disk_total: number
  uptime: number
  ha: boolean
  agent: boolean
  ostype: string
  description: string
  tags: string[]
  onboot: boolean
  disks: { id: string; spec: string }[]
  nets: { id: string; spec: string }[]
  history: HistoryPoint[]
}

export type HistoryRange = "hour" | "day" | "week"

export interface HostSeries {
  id: string
  name: string
  kind: HostKind
  points: UsagePoint[]
}

export interface NetIface {
  node: string
  iface: string
  type: string
  active: boolean
  autostart: boolean
  method: string
  cidr: string
  gateway: string
  cidr6: string
  ports: string[]
  vlan_aware: boolean
  bond_mode: string
  comments: string
}

export interface GuestNic {
  guest_id: string
  guest_name: string
  guest_type: "qemu" | "lxc"
  node: string
  status: string
  iface: string
  model: string
  mac: string
  bridge: string
  tag: string
  firewall: boolean
  ip: string
  rate: string
  link_down: boolean
}

export interface DockerNetwork {
  id: string
  name: string
  host: string
  driver: string
  scope: string
  subnet: string
  gateway: string
  internal: boolean
  builtin: boolean
  containers: { name: string; ip: string }[]
}

export interface NetworkData {
  interfaces: NetIface[]
  guest_nics: GuestNic[]
  docker_networks: DockerNetwork[]
  errors: { source: string; detail: string }[]
}

export interface BackupJob {
  id: string
  enabled: boolean
  schedule: string
  next_run: number
  storage: string
  selection: string
  exclude: string
  mode: string
  compress: string
  node: string
  comment: string
  retention: string
}

export interface BackupFile {
  volid: string
  storage: string
  vmid: string
  type: "qemu" | "lxc"
  size: number
  ctime: number
  format: string
  notes: string
  protected: boolean
  verified: string
}

export interface BackupsData {
  jobs: BackupJob[]
  files: BackupFile[]
  not_backed_up: { vmid: string; name: string; type: string }[]
  errors: { storage: string; detail: string }[]
  tasks: Task[]
}

export interface Snapshot {
  name: string
  description: string
  snaptime: number
  vmstate: boolean
  parent: string
}

export interface GuestSnapshot extends Snapshot {
  guest_id: string
  guest_name: string
  guest_type: "qemu" | "lxc"
  node: string
}

export type Severity = "info" | "warning" | "critical"

export interface Alert {
  id: number
  key: string
  rule: string
  severity: Severity
  title: string
  detail: string
  target: string
  started_at: number
  resolved_at: number | null
  acknowledged: boolean
  ack_by: string
}

export type ChannelType = "email" | "discord" | "telegram" | "ntfy" | "webhook"

export interface Channel {
  id?: string
  type: ChannelType
  name: string
  enabled: boolean
  min_severity: Severity
  config: Record<string, string>
}

export interface AlertRules {
  node_offline: { enabled: boolean }
  source_error: { enabled: boolean; minutes: number }
  cpu: { enabled: boolean; threshold: number; minutes: number }
  memory: { enabled: boolean; threshold: number; minutes: number }
  storage: { enabled: boolean; warning: number; critical: number }
  storage_unavailable: { enabled: boolean; minutes: number }
  backup_failed: { enabled: boolean }
  container_unhealthy: { enabled: boolean; minutes: number }
  uncovered_guests: { enabled: boolean }
  snapshot_age: { enabled: boolean; days: number }
}

export interface AlertConfig {
  lang: "fr" | "en"
  notify_resolved: boolean
  public_url: string
  rules: AlertRules
  channels: Channel[]
}

export const SECRET_PLACEHOLDER = "__secret__"

export interface TaskStatusResult {
  upid: string
  running: boolean
  ok: boolean | null
  exitstatus: string
  log: string[]
}

export type GuestAction = "start" | "shutdown" | "stop" | "reboot" | "suspend" | "resume"
export type ContainerAction = "start" | "stop" | "restart" | "pause" | "unpause"

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
  storages: Storage[]
  history: UsagePoint[]
  actions_enabled: boolean
}

export type Role = "viewer" | "operator" | "admin"

export interface UserAccount {
  id: number
  username: string
  role: Role
  disabled: boolean
  created_at: number
  last_login: number | null
  sessions: number
}

export interface UpdateStatus {
  current: string
  latest: string | null
  available: boolean
  supported: boolean
  running: boolean
  last_exit: number | null
  last_run: number | null
  log: string[]
}

export interface AuthStatus {
  setup_required: boolean
  authenticated: boolean
  user: { username: string; role: Role } | null
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
  audit: (limit = 100) => request<AuditEntry[]>(`/api/audit?limit=${limit}`),
  nodeDetail: (node: string, tf: Timeframe = "hour") =>
    request<NodeDetail>(`/api/proxmox/nodes/${encodeURIComponent(node)}?timeframe=${tf}`),
  guestDetail: (node: string, type: "qemu" | "lxc", vmid: string, tf: Timeframe = "hour") =>
    request<GuestDetail>(`/api/proxmox/guests/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}?timeframe=${tf}`),
  guestAction: (node: string, type: "qemu" | "lxc", vmid: string, action: GuestAction) =>
    post<{ upid: string; node: string }>(`/api/proxmox/guests/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/${action}`),
  taskStatus: (node: string, upid: string) =>
    request<TaskStatusResult>(`/api/proxmox/task?node=${encodeURIComponent(node)}&upid=${encodeURIComponent(upid)}`),
  metricsHistory: (range: HistoryRange, host?: string) =>
    request<{ range: HistoryRange; hosts: HostSeries[] }>(
      `/api/metrics/history?range=${range}${host ? `&host=${encodeURIComponent(host)}` : ""}`
    ),
  network: () => request<NetworkData>("/api/network"),
  backups: () => request<BackupsData>("/api/backups"),
  guestBackup: (node: string, type: "qemu" | "lxc", vmid: string, storage: string, mode: "snapshot" | "suspend" | "stop") =>
    post<{ upid: string; node: string }>(`/api/proxmox/guests/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/backup`, {
      storage,
      mode,
    }),
  snapshots: () => request<GuestSnapshot[]>("/api/snapshots"),
  guestSnapshots: (node: string, type: "qemu" | "lxc", vmid: string) =>
    request<Snapshot[]>(`/api/proxmox/guests/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/snapshots`),
  snapshotCreate: (node: string, type: "qemu" | "lxc", vmid: string, name: string, description: string, vmstate: boolean) =>
    post<{ upid: string; node: string }>(`/api/proxmox/guests/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/snapshots`, {
      name,
      description,
      vmstate,
    }),
  snapshotRollback: (node: string, type: "qemu" | "lxc", vmid: string, name: string) =>
    post<{ upid: string; node: string }>(
      `/api/proxmox/guests/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/snapshots/${encodeURIComponent(name)}/rollback`,
      { confirm: name }
    ),
  snapshotDelete: (node: string, type: "qemu" | "lxc", vmid: string, name: string) =>
    request<{ upid: string; node: string }>(
      `/api/proxmox/guests/${encodeURIComponent(node)}/${type}/${encodeURIComponent(vmid)}/snapshots/${encodeURIComponent(name)}`,
      { method: "DELETE" }
    ),
  alerts: (state: "active" | "all" = "active") => request<Alert[]>(`/api/alerts?state=${state}`),
  alertAck: (id: number) => post<{ ok: boolean }>(`/api/alerts/${id}/ack`),
  alertsEvaluate: () => post<Alert[]>("/api/alerts/evaluate"),
  alertConfig: () => request<AlertConfig>("/api/alerts/config"),
  saveAlertConfig: (cfg: AlertConfig) =>
    request<AlertConfig>("/api/alerts/config", { method: "PUT", body: JSON.stringify(cfg) }),
  testChannel: (id: string) => post<{ ok: boolean }>(`/api/alerts/channels/${encodeURIComponent(id)}/test`),
  containerAction: (id: string, action: ContainerAction) =>
    post<{ ok: boolean }>(`/api/docker/containers/${encodeURIComponent(id)}/${action}`),
  containerLogs: (id: string, tail = 200) =>
    request<{ id: string; name: string; logs: string }>(`/api/docker/containers/${encodeURIComponent(id)}/logs?tail=${tail}`),
  system: {
    update: () => request<UpdateStatus>("/api/system/update"),
    startUpdate: () => post<{ ok: boolean }>("/api/system/update"),
  },
  users: {
    list: () => request<UserAccount[]>("/api/users"),
    create: (username: string, password: string, role: Role) =>
      post<UserAccount>("/api/users", { username, password, role }),
    update: (id: number, patch: { role?: Role; disabled?: boolean; password?: string }) =>
      request<UserAccount>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    remove: (id: number) => request<{ ok: boolean }>(`/api/users/${id}`, { method: "DELETE" }),
  },
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
