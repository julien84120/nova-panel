import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react"
import { useState, type FormEvent } from "react"

import { FormError } from "@/components/auth/AuthLayout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/AuthProvider"
import { useDashboard } from "@/hooks/DashboardProvider"
import { useI18n } from "@/i18n/I18nProvider"
import { api } from "@/lib/api"
import { authErrorMessage } from "@/lib/authErrors"
import { NotificationSettings } from "@/components/alerts/NotificationSettings"
import { UsersSettings } from "@/components/users/UsersSettings"
import { usePermissions } from "@/hooks/usePermissions"
import { useQueryParam } from "@/hooks/useQueryParam"
import { cn } from "@/lib/utils"

export function SettingsPage() {
  const { t } = useI18n()
  const { status } = useAuth()
  const { data } = useDashboard()
  const min = status?.min_password_length ?? 10
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useQueryParam("tab")
  const { isAdmin } = usePermissions()
  const tabs = isAdmin ? (["account", "users", "alerts"] as const) : (["account"] as const)
  const currentTab = (tabs as readonly string[]).includes(tab) ? tab : "account"

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setDone(false)
    if (next !== confirm) return setError(t("auth.err.mismatch"))
    if (next.length < min) return setError(t("auth.err.passwordShort"))
    setBusy(true)
    setError(null)
    try {
      await api.auth.changePassword(current, next)
      setDone(true)
      setCurrent("")
      setNext("")
      setConfirm("")
    } catch (err) {
      setError(authErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("nav.settings")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <div className="flex w-fit rounded-lg border bg-card/60 p-0.5 text-sm">
        {tabs.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k === "account" ? "" : k)}
            className={cn(
              "rounded-md px-3 py-1 font-medium transition-colors",
              currentTab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(k === "account" ? "settings.tabAccount" : k === "users" ? "settings.tabUsers" : "settings.tabAlerts")}
          </button>
        ))}
      </div>

      {currentTab === "alerts" ? (
        <NotificationSettings />
      ) : currentTab === "users" ? (
        <UsersSettings />
      ) : (
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              {t("settings.password")}
            </CardTitle>
            <CardDescription>
              {t("settings.passwordDesc").replace("{user}", status?.user?.username ?? "")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="max-w-sm space-y-4">
              <FormError message={error} />
              {done && (
                <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  <CheckCircle2 className="size-4" /> {t("settings.passwordDone")}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="current">{t("settings.current")}</Label>
                <Input id="current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="next">{t("settings.new")}</Label>
                <Input id="next" type="password" autoComplete="new-password" required minLength={min} value={next} onChange={(e) => setNext(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t("auth.passwordRule").replace("{n}", String(min))}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">{t("auth.confirm")}</Label>
                <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {t("settings.save")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.sources")}</CardTitle>
            <CardDescription>{t("settings.sourcesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.sources.map((s) => (
              <div key={s.kind + s.name} className="flex items-center justify-between gap-3 rounded-lg border bg-background/40 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{s.kind === "proxmox" ? "Proxmox VE" : "Docker (SSH)"}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground" title={s.detail || s.name}>
                    {s.detail || s.name}
                  </div>
                </div>
                <Badge variant={s.mode === "live" ? "success" : s.mode === "demo" ? "warning" : "destructive"}>
                  {s.mode === "live" ? t("header.live") : s.mode === "demo" ? t("header.demo") : t("header.partial")}
                </Badge>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">{t("settings.sourcesHint")}</p>
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  )
}
