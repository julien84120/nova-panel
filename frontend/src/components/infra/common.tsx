import type { ReactNode } from "react"
import { Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/i18n/I18nProvider"
import type { TranslationKey } from "@/i18n/translations"
import type { Guest, Timeframe } from "@/lib/api"
import type { StatusFilter } from "@/lib/guests"
import { cn } from "@/lib/utils"

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

export function GuestStatus({ status, health }: { status: Guest["status"] | string; health?: string }) {
  const { t } = useI18n()
  const v = status === "running" ? "success" : status === "paused" ? "warning" : status === "stopped" ? "secondary" : "outline"
  const key = (["running", "stopped", "paused"].includes(status) ? `status.${status}` : "status.unknown") as TranslationKey
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={v} className="gap-1.5">
        <span className={cn("size-1.5 rounded-full bg-current", status === "running" && "animate-pulse")} />
        {t(key)}
      </Badge>
      {health && (
        <Badge variant={health === "healthy" ? "success" : health === "unhealthy" ? "destructive" : "outline"} className="text-[10px]">
          {health}
        </Badge>
      )}
    </span>
  )
}

/** Petite barre d'utilisation avec pourcentage (tableaux). */
export function InlineMeter({ value, hint, className }: { value: number; hint?: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={cn("w-32", className)}>
      <div className="mb-1 flex justify-between gap-2 text-xs tabular-nums">
        <span className="font-medium">{Math.round(value)}%</span>
        {hint && <span className="truncate text-muted-foreground">{hint}</span>}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-700", v >= 85 ? "bg-destructive" : v >= 65 ? "bg-warning" : "bg-primary")}
          style={{ width: `${Math.max(v, 1)}%` }}
        />
      </div>
    </div>
  )
}


export function Toolbar({
  query,
  onQuery,
  filter,
  onFilter,
  counts,
  children,
}: {
  query: string
  onQuery: (q: string) => void
  filter: StatusFilter
  onFilter: (f: StatusFilter) => void
  counts: Record<StatusFilter, number>
  children?: ReactNode
}) {
  const { t } = useI18n()
  const items: { k: StatusFilter; l: TranslationKey }[] = [
    { k: "all", l: "common.all" },
    { k: "running", l: "common.running" },
    { k: "stopped", l: "common.stopped" },
  ]
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("common.search")}
          className="h-9 w-full rounded-lg border border-input bg-background/40 pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
      </div>
      <div className="flex rounded-lg border bg-background/40 p-0.5 text-xs">
        {items.map((i) => (
          <button
            key={i.k}
            onClick={() => onFilter(i.k)}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              filter === i.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(i.l)} <span className="ml-0.5 opacity-70 tabular-nums">{counts[i.k]}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}

export function TimeframeToggle({ value, onChange }: { value: Timeframe; onChange: (t: Timeframe) => void }) {
  const { t } = useI18n()
  return (
    <div className="flex rounded-lg border bg-background/40 p-0.5 text-xs">
      {(["hour", "day", "week", "month"] as const).map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={cn(
            "rounded-md px-2 py-0.5 font-medium transition-colors",
            value === tf ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t(`tf.${tf}` as TranslationKey)}
        </button>
      ))}
    </div>
  )
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  )
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right break-words">{children}</span>
    </div>
  )
}
