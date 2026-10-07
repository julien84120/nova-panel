import { AlertTriangle, PlugZap } from "lucide-react"

import { useI18n } from "@/i18n/I18nProvider"
import type { SourceStatus } from "@/lib/api"

export function ApiErrorBanner({ message }: { message: string }) {
  const { t } = useI18n()
  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
      <PlugZap className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div>
        <div className="font-medium">{t("api.unreachable")}</div>
        <div className="mt-0.5 text-muted-foreground">
          {t("api.unreachableHint")} <code className="font-mono text-xs">({message})</code>
        </div>
      </div>
    </div>
  )
}

export function SourceAlerts({ sources }: { sources: SourceStatus[] }) {
  const { t } = useI18n()
  const failing = sources.filter((s) => s.mode === "error")
  if (!failing.length) return null
  return (
    <div className="space-y-2">
      {failing.map((s) => (
        <div key={s.kind + s.name} className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <div className="font-medium">
              {s.kind === "proxmox" ? "Proxmox" : "Docker (SSH)"} · {s.name} — {t("api.sourceError")}
            </div>
            <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={s.detail}>
              {s.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
