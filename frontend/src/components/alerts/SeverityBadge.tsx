import { AlertOctagon, AlertTriangle, Info } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/i18n/I18nProvider"
import type { TranslationKey } from "@/i18n/translations"
import type { Severity } from "@/lib/api"

const ICON = { info: Info, warning: AlertTriangle, critical: AlertOctagon }
const VARIANT = { info: "default", warning: "warning", critical: "destructive" } as const

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useI18n()
  const Icon = ICON[severity]
  return (
    <Badge variant={VARIANT[severity]}>
      <Icon />
      {t(`sev.${severity}` as TranslationKey)}
    </Badge>
  )
}

export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const Icon = ICON[severity]
  const color = severity === "critical" ? "text-destructive" : severity === "warning" ? "text-warning" : "text-primary"
  return <Icon className={`${color} ${className ?? "size-4"}`} />
}
