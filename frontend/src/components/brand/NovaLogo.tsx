import { cn } from "@/lib/utils"

export function NovaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="nova-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#nova-g)" />
      <path d="M16 6l2.4 7.6L26 16l-7.6 2.4L16 26l-2.4-7.6L6 16l7.6-2.4z" fill="#fff" />
    </svg>
  )
}

export function NovaLogo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <NovaMark className="shrink-0" />
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-foreground">
            Nova<span className="text-primary">Panel</span>
          </div>
          <div className="text-[11px] text-muted-foreground">v0.8.0 · open-source</div>
        </div>
      )}
    </div>
  )
}
