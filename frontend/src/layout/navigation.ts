import {
  Archive,
  BellRing,
  Camera,
  Boxes,
  Container,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  Monitor,
  Network,
  Server,
  Settings,
  type LucideIcon,
} from "lucide-react"

import type { TranslationKey } from "@/i18n/translations"

export interface NavItem {
  to: string
  label: TranslationKey
  icon: LucideIcon
  /** Compteur dynamique affiché à droite (calculé depuis l'API). */
  count?: "nodes" | "vms" | "lxc" | "docker" | "alerts"
}

export interface NavSection {
  title: TranslationKey
  items: NavItem[]
}

export const navigation: NavSection[] = [
  {
    title: "nav.overview",
    items: [{ to: "/", label: "nav.dashboard", icon: LayoutDashboard }],
  },
  {
    title: "nav.infrastructure",
    items: [
      { to: "/nodes", label: "nav.nodes", icon: Server, count: "nodes" },
      { to: "/vms", label: "nav.vms", icon: Monitor, count: "vms" },
      { to: "/lxc", label: "nav.lxc", icon: Boxes, count: "lxc" },
      { to: "/docker", label: "nav.docker", icon: Container, count: "docker" },
      { to: "/storage", label: "nav.storage", icon: HardDrive },
      { to: "/network", label: "nav.network", icon: Network },
    ],
  },
  {
    title: "nav.operations",
    items: [
      { to: "/backups", label: "nav.backups", icon: Archive },
      { to: "/snapshots", label: "nav.snapshots", icon: Camera },
      { to: "/alerts", label: "nav.alerts", icon: BellRing, count: "alerts" },
      { to: "/tasks", label: "nav.tasks", icon: ListChecks },
    ],
  },
]

export const settingsItem: NavItem = { to: "/settings", label: "nav.settings", icon: Settings }
