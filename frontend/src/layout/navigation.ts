import {
  Archive,
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
  badge?: string
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
      { to: "/nodes", label: "nav.nodes", icon: Server, badge: "2" },
      { to: "/vms", label: "nav.vms", icon: Monitor, badge: "14" },
      { to: "/lxc", label: "nav.lxc", icon: Boxes, badge: "9" },
      { to: "/docker", label: "nav.docker", icon: Container, badge: "14" },
      { to: "/storage", label: "nav.storage", icon: HardDrive },
      { to: "/network", label: "nav.network", icon: Network },
    ],
  },
  {
    title: "nav.operations",
    items: [
      { to: "/backups", label: "nav.backups", icon: Archive },
      { to: "/tasks", label: "nav.tasks", icon: ListChecks },
    ],
  },
]

export const settingsItem: NavItem = { to: "/settings", label: "nav.settings", icon: Settings }
