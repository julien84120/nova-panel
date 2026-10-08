import { Bell, Boxes, Check, ChevronDown, Container, Languages, LogOut, Menu, Monitor, Moon, Search, Server, Sun, User } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { useNavigate } from "react-router-dom"

import { useAuth } from "@/hooks/AuthProvider"
import { useDashboard } from "@/hooks/DashboardProvider"
import { useTheme } from "@/hooks/useTheme"
import { useI18n } from "@/i18n/I18nProvider"
import { cn } from "@/lib/utils"

export function Header({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { t, lang, setLang } = useI18n()
  const { theme, toggle } = useTheme()
  const { data, error, selectedHost, setSelectedHost } = useDashboard()
  const { status: auth, logout } = useAuth()
  const navigate = useNavigate()
  const username = auth?.user?.username ?? ""
  const initials = username.slice(0, 2).toUpperCase()
  const hosts = data?.hosts ?? []

  const hostLabel = selectedHost === "all" ? t("header.allHosts") : (hosts.find((h) => h.id === selectedHost)?.name ?? "…")
  const hasError = !!error || data?.sources.some((s) => s.mode === "error")
  const status = hasError
    ? { variant: "destructive" as const, label: t("header.partial") }
    : data?.demo
      ? { variant: "warning" as const, label: t("header.demo") }
      : { variant: "success" as const, label: t("header.live") }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Menu">
        <Menu />
      </Button>

      {/* Recherche globale */}
      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1.5">
        {(data || error) && (
          <Badge variant={status.variant} className="mr-1 hidden gap-1.5 sm:inline-flex">
            <span className="size-1.5 rounded-full bg-current" />
            {status.label}
          </Badge>
        )}

        {/* Sélecteur d'hôte */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="hidden gap-2 bg-card/60 sm:flex">
              <Server className="text-primary" />
              <span className="max-w-32 truncate">{hostLabel}</span>
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={() => setSelectedHost("all")}>
              <Server />
              <span className="flex-1">{t("header.allHosts")}</span>
              {selectedHost === "all" && <Check className="text-primary!" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {hosts.map((h) => (
              <DropdownMenuItem key={h.id} onSelect={() => setSelectedHost(h.id)}>
                <span
                  className={cn(
                    "size-2 rounded-full",
                    h.status === "online" ? "bg-success" : h.status === "warning" ? "bg-warning" : "bg-destructive"
                  )}
                />
                <span className="flex-1">
                  {h.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">{h.kind === "proxmox" ? "PVE" : "Docker"}</span>
                </span>
                {selectedHost === h.id && <Check className="text-primary!" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 hidden h-6! sm:block" />

        {/* Langue */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={t("header.language")} className="gap-1.5 px-2">
              <Languages />
              <span className="text-xs font-semibold uppercase">{lang}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("header.language")}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setLang("fr")}>
              <span className="w-5 text-center">🇫🇷</span>
              <span className="flex-1">Français</span>
              {lang === "fr" && <Check className="text-primary!" />}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLang("en")}>
              <span className="w-5 text-center">🇬🇧</span>
              <span className="flex-1">English</span>
              {lang === "en" && <Check className="text-primary!" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Thème */}
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={t("header.theme")}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative" aria-label={t("header.notifications")}>
          <Bell />
          <span className="absolute top-2 right-2 size-2 rounded-full bg-primary ring-2 ring-background" />
        </Button>

        {/* Profil */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 flex items-center gap-2 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <Avatar className="size-8 ring-1 ring-border">
                <AvatarFallback className="bg-primary/15 text-primary">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-foreground">
              <div className="text-sm font-medium">{username}</div>
              <div className="text-xs font-normal text-muted-foreground">{t("header.admin")}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/settings")}>
              <User />
              {t("header.profile")}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => logout()}>
              <LogOut className="text-destructive!" />
              {t("header.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

const GUEST_ROUTES = { qemu: "/vms", lxc: "/lxc", docker: "/docker" } as const
const GUEST_ICONS = { qemu: Monitor, lxc: Boxes, docker: Container } as const

function GlobalSearch() {
  const { t } = useI18n()
  const { data } = useDashboard()
  const navigate = useNavigate()
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  // Raccourci ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term || !data) return []
    const guests = data.guests
      .filter((g) => [g.name, g.id, g.image, ...g.tags].some((v) => v?.toLowerCase().includes(term)))
      .slice(0, 7)
      .map((g) => ({
        key: `${g.type}-${g.host}-${g.id}`,
        icon: GUEST_ICONS[g.type],
        label: g.name,
        sub: `${g.type === "qemu" ? "VM " + g.id : g.type === "lxc" ? "CT " + g.id : "Docker"} · ${g.host}`,
        to: `${GUEST_ROUTES[g.type]}?q=${encodeURIComponent(g.name)}`,
      }))
    const hosts = data.hosts
      .filter((h) => h.name.toLowerCase().includes(term))
      .map((h) => ({ key: h.id, icon: Server, label: h.name, sub: h.os, to: h.kind === "proxmox" ? "/nodes" : "/docker" }))
    return [...hosts, ...guests].slice(0, 8)
  }, [q, data])

  const go = (to: string) => {
    navigate(to)
    setQ("")
    setOpen(false)
    input.current?.blur()
  }

  return (
    <div className="relative hidden max-w-md flex-1 md:block">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={input}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, results.length - 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === "Enter" && results[active]) {
            go(results[active].to)
          } else if (e.key === "Escape") {
            setOpen(false)
            input.current?.blur()
          }
        }}
        placeholder={t("header.search")}
        className="h-9 w-full rounded-lg border border-input bg-card/60 pr-14 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        ⌘K
      </kbd>
      {open && q.trim() && (
        <div className="absolute top-11 right-0 left-0 z-50 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg">
          {results.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">{t("common.noResults")}</div>}
          {results.map((r, i) => (
            <button
              key={r.key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(r.to)}
              onMouseEnter={() => setActive(i)}
              className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm", i === active && "bg-accent")}
            >
              <r.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
