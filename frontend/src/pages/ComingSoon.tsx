import { Construction } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useI18n } from "@/i18n/I18nProvider"
import type { TranslationKey } from "@/i18n/translations"

export function ComingSoon({ title }: { title: TranslationKey }) {
  const { t } = useI18n()
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t(title)}</h1>
      <Card className="items-center px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Construction className="size-6" />
        </span>
        <div>
          <div className="font-medium">{t("soon.title")}</div>
          <p className="mt-1 text-sm text-muted-foreground">{t("soon.desc")}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">{t("soon.back")}</Link>
        </Button>
      </Card>
    </div>
  )
}
