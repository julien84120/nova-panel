import type { ReactNode } from "react"

import { NovaMark } from "@/components/brand/NovaLogo"
import { useI18n } from "@/i18n/I18nProvider"
import { cn } from "@/lib/utils"

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { lang, setLang } = useI18n()
  return (
    <div className="nova-glow relative flex min-h-full flex-col items-center justify-center px-4 py-12">
      <div className="absolute top-4 right-4 flex rounded-lg border bg-card/60 p-0.5 text-xs font-semibold">
        {(["fr", "en"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={cn(
              "rounded-md px-2.5 py-1 uppercase transition-colors",
              lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <NovaMark className="size-12" />
          <div className="mt-4 text-xl font-semibold tracking-tight">
            Nova<span className="text-primary">Panel</span>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-lg shadow-black/10">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  )
}
