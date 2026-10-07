import { NavLink } from "react-router-dom"
import { ChevronsLeft, ChevronsRight } from "lucide-react"

import { NovaLogo } from "@/components/brand/NovaLogo"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/i18n/I18nProvider"
import { cn } from "@/lib/utils"
import { navigation, settingsItem, type NavItem } from "./navigation"

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onNavigate?: () => void
  className?: string
}

export function Sidebar({ collapsed, onToggle, onNavigate, className }: SidebarProps) {
  const { t } = useI18n()

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300",
        collapsed ? "w-[72px]" : "w-64",
        className
      )}
    >
      {/* Logo */}
      <div className={cn("flex h-16 items-center border-b border-sidebar-border", collapsed ? "justify-center px-0" : "px-5")}>
        <NovaLogo collapsed={collapsed} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {navigation.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <div className="mb-2 px-3 text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase">
                {t(section.title)}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <SidebarLink item={item} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Pied de sidebar */}
      <div className="space-y-1 border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="mb-2 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              homelab-cluster
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">3 / 3 · quorum OK</div>
          </div>
        )}
        <SidebarLink item={settingsItem} collapsed={collapsed} onNavigate={onNavigate} />
        <button
          onClick={onToggle}
          className={cn(
            "hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground lg:flex",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && <span>{t("nav.collapse")}</span>}
        </button>
      </div>
    </aside>
  )
}

function SidebarLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useI18n()
  const Icon = item.icon

  const link = (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-primary/12 font-medium text-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-foreground"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full bg-primary" />}
          <Icon className={cn("size-[18px] shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
          {!collapsed && <span className="flex-1 truncate">{t(item.label)}</span>}
          {!collapsed && item.badge && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{t(item.label)}</TooltipContent>
    </Tooltip>
  )
}
