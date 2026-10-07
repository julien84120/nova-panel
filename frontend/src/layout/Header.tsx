import { Bell, Check, ChevronDown, Languages, LogOut, Menu, Moon, Search, Server, Sun, User } from "lucide-react"

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
import { useDashboard } from "@/hooks/DashboardProvider"
import { useTheme } from "@/hooks/useTheme"
import { useI18n } from "@/i18n/I18nProvider"
import { cn } from "@/lib/utils"

export function Header({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { t, lang, setLang } = useI18n()
  const { theme, toggle } = useTheme()
  const { data, error, selectedHost, setSelectedHost } = useDashboard()
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

      {/* Recherche */}
      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder={t("header.search")}
          className="h-9 w-full rounded-lg border border-input bg-card/60 pr-14 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </div>

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
                <AvatarFallback className="bg-primary/15 text-primary">JU</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-foreground">
              <div className="text-sm font-medium">Julien</div>
              <div className="text-xs font-normal text-muted-foreground">admin@pam</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User />
              {t("header.profile")}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              <LogOut className="text-destructive!" />
              {t("header.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
