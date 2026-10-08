import { Bell, Loader2, Mail, MessageCircle, Pencil, Plus, Save, Send, Trash2, Webhook } from "lucide-react"
import { useEffect, useState, type ComponentType } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAlerts } from "@/hooks/AlertsProvider"
import { useI18n } from "@/i18n/I18nProvider"
import type { TranslationKey } from "@/i18n/translations"
import { api, ApiError, SECRET_PLACEHOLDER, type AlertConfig, type AlertRules, type Channel, type ChannelType, type Severity } from "@/lib/api"
import { cn } from "@/lib/utils"

interface FieldDef {
  key: string
  label: TranslationKey
  secret?: boolean
  placeholder?: string
  options?: string[]
  required?: boolean
}

const CHANNELS: Record<ChannelType, { icon: ComponentType<{ className?: string }>; label: string; fields: FieldDef[] }> = {
  email: {
    icon: Mail,
    label: "E-mail (SMTP)",
    fields: [
      { key: "host", label: "ch.smtpHost", placeholder: "smtp.gmail.com", required: true },
      { key: "port", label: "ch.port", placeholder: "587" },
      { key: "security", label: "ch.security", options: ["starttls", "ssl", "none"] },
      { key: "username", label: "ch.username" },
      { key: "password", label: "ch.password", secret: true },
      { key: "sender", label: "ch.sender", placeholder: "novapanel@example.com" },
      { key: "to", label: "ch.to", placeholder: "moi@example.com", required: true },
    ],
  },
  discord: {
    icon: MessageCircle,
    label: "Discord",
    fields: [{ key: "url", label: "ch.webhookUrl", secret: true, placeholder: "https://discord.com/api/webhooks/…", required: true }],
  },
  telegram: {
    icon: Send,
    label: "Telegram",
    fields: [
      { key: "bot_token", label: "ch.botToken", secret: true, placeholder: "123456:ABC…", required: true },
      { key: "chat_id", label: "ch.chatId", placeholder: "123456789", required: true },
    ],
  },
  ntfy: {
    icon: Bell,
    label: "ntfy",
    fields: [
      { key: "server", label: "ch.server", placeholder: "https://ntfy.sh" },
      { key: "topic", label: "ch.topic", placeholder: "novapanel-xxxx", required: true },
      { key: "token", label: "ch.token", secret: true },
    ],
  },
  webhook: {
    icon: Webhook,
    label: "Webhook JSON",
    fields: [
      { key: "url", label: "ch.url", secret: true, placeholder: "https://…", required: true },
      { key: "secret", label: "ch.bearer", secret: true },
    ],
  },
}

type RuleKey = keyof AlertRules
const RULES: { key: RuleKey; fields: { k: string; label: TranslationKey; unit: string }[] }[] = [
  { key: "node_offline", fields: [] },
  { key: "source_error", fields: [{ k: "minutes", label: "rule.after", unit: "min" }] },
  { key: "cpu", fields: [{ k: "threshold", label: "rule.threshold", unit: "%" }, { k: "minutes", label: "rule.during", unit: "min" }] },
  { key: "memory", fields: [{ k: "threshold", label: "rule.threshold", unit: "%" }, { k: "minutes", label: "rule.during", unit: "min" }] },
  { key: "storage", fields: [{ k: "warning", label: "rule.warningAt", unit: "%" }, { k: "critical", label: "rule.criticalAt", unit: "%" }] },
  { key: "storage_unavailable", fields: [{ k: "minutes", label: "rule.after", unit: "min" }] },
  { key: "backup_failed", fields: [] },
  { key: "container_unhealthy", fields: [{ k: "minutes", label: "rule.after", unit: "min" }] },
  { key: "uncovered_guests", fields: [] },
  { key: "snapshot_age", fields: [{ k: "days", label: "rule.olderThan", unit: "j" }] },
]

export function NotificationSettings() {
  const { t } = useI18n()
  const { reload } = useAlerts()
  const [cfg, setCfg] = useState<AlertConfig | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<{ index: number; channel: Channel } | null>(null)
  const [testing, setTesting] = useState<string | null>(null)

  useEffect(() => {
    api.alertConfig().then(setCfg).catch((e: unknown) => toast.error(String(e)))
  }, [])

  if (!cfg) return <Card className="h-64 animate-pulse bg-card/60" />

  const update = (fn: (c: AlertConfig) => AlertConfig) => {
    setCfg((c) => (c ? fn(structuredClone(c)) : c))
    setDirty(true)
  }

  const save = async (next = cfg) => {
    setSaving(true)
    try {
      const saved = await api.saveAlertConfig(next)
      setCfg(saved)
      setDirty(false)
      await api.alertsEvaluate()
      reload()
      toast.success(t("notif.saved"))
      return saved
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : String(e))
      return null
    } finally {
      setSaving(false)
    }
  }

  const test = async (ch: Channel) => {
    if (!ch.id) return
    setTesting(ch.id)
    try {
      await api.testChannel(ch.id)
      toast.success(t("notif.testOk").replace("{name}", ch.name))
    } catch (e) {
      toast.error(t("notif.testFail").replace("{name}", ch.name), { description: e instanceof ApiError ? e.detail : String(e) })
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Barre d'enregistrement */}
      <div className="sticky top-16 z-20 flex items-center justify-between gap-3 rounded-xl border bg-card/90 px-4 py-3 backdrop-blur">
        <span className="text-sm text-muted-foreground">{dirty ? t("notif.unsaved") : t("notif.upToDate")}</span>
        <Button onClick={() => save()} disabled={!dirty || saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {t("settings.save")}
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Canaux */}
        <Card>
          <CardHeader>
            <CardTitle>{t("notif.channels")}</CardTitle>
            <CardDescription>{t("notif.channelsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cfg.channels.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("notif.noChannel")}</p>}
            {cfg.channels.map((ch, i) => {
              const def = CHANNELS[ch.type]
              return (
                <div key={ch.id ?? i} className="flex items-center gap-3 rounded-lg border bg-background/40 p-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <def.icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{ch.name}</span>
                      {!ch.enabled && <Badge variant="secondary">{t("notif.off")}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {def.label} · {t("notif.minSeverity")} {t(`sev.${ch.min_severity}` as TranslationKey).toLowerCase()}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" disabled={!ch.id || dirty || testing === ch.id} onClick={() => test(ch)} title={dirty ? t("notif.saveFirst") : ""}>
                    {testing === ch.id ? <Loader2 className="animate-spin" /> : <Send />}
                    {t("notif.test")}
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditing({ index: i, channel: structuredClone(ch) })}>
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive hover:text-destructive"
                    onClick={() => update((c) => ({ ...c, channels: c.channels.filter((_, j) => j !== i) }))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )
            })}
            <div className="flex flex-wrap gap-2 pt-1">
              {(Object.keys(CHANNELS) as ChannelType[]).map((type) => {
                const def = CHANNELS[type]
                return (
                  <Button
                    key={type}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditing({ index: -1, channel: { type, name: def.label, enabled: true, min_severity: "warning", config: {} } })
                    }
                  >
                    <Plus />
                    <def.icon className="size-3.5" />
                    {def.label}
                  </Button>
                )
              })}
            </div>
            <div className="space-y-3 border-t pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-[var(--primary)]"
                  checked={cfg.notify_resolved}
                  onChange={(e) => update((c) => ({ ...c, notify_resolved: e.target.checked }))}
                />
                {t("notif.notifyResolved")}
              </label>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor="puburl">{t("notif.publicUrl")}</Label>
                  <Input
                    id="puburl"
                    placeholder="http://192.168.0.249:8080"
                    value={cfg.public_url}
                    onChange={(e) => update((c) => ({ ...c, public_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("notif.lang")}</Label>
                  <div className="flex rounded-lg border p-0.5 text-xs">
                    {(["fr", "en"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => update((c) => ({ ...c, lang: l }))}
                        className={cn("rounded-md px-3 py-1.5 font-semibold uppercase", cfg.lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Règles */}
        <Card>
          <CardHeader>
            <CardTitle>{t("notif.rules")}</CardTitle>
            <CardDescription>{t("notif.rulesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {RULES.map(({ key, fields }) => {
              const rule = cfg.rules[key] as Record<string, number | boolean>
              return (
                <div key={key} className="flex flex-wrap items-center gap-3 py-2.5">
                  <label className="flex min-w-48 flex-1 items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="accent-[var(--primary)]"
                      checked={!!rule.enabled}
                      onChange={(e) =>
                        update((c) => {
                          ;(c.rules[key] as Record<string, number | boolean>).enabled = e.target.checked
                          return c
                        })
                      }
                    />
                    <span>
                      <span className="font-medium">{t(`rule.${key}` as TranslationKey)}</span>
                      <span className="block text-xs text-muted-foreground">{t(`rule.${key}.desc` as TranslationKey)}</span>
                    </span>
                  </label>
                  {fields.map((f) => (
                    <label key={f.k} className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", !rule.enabled && "opacity-50")}>
                      {t(f.label)}
                      <input
                        type="number"
                        min={0}
                        disabled={!rule.enabled}
                        value={Number(rule[f.k])}
                        onChange={(e) =>
                          update((c) => {
                            ;(c.rules[key] as Record<string, number | boolean>)[f.k] = Number(e.target.value)
                            return c
                          })
                        }
                        className="h-8 w-16 rounded-md border border-input bg-background/40 px-2 text-right text-sm text-foreground tabular-nums outline-none focus-visible:border-ring"
                      />
                      {f.unit}
                    </label>
                  ))}
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <ChannelDialog
        value={editing?.channel ?? null}
        onClose={() => setEditing(null)}
        onSave={async (ch) => {
          if (!editing) return
          const next = structuredClone(cfg)
          if (editing.index === -1) next.channels.push(ch)
          else next.channels[editing.index] = ch
          setEditing(null)
          // Enregistrement immédiat : un canal doit être sauvé pour pouvoir être testé
          await save(next)
        }}
      />
    </div>
  )
}

function ChannelDialog({ value, onClose, onSave }: { value: Channel | null; onClose: () => void; onSave: (c: Channel) => void }) {
  const { t } = useI18n()
  const [ch, setCh] = useState<Channel | null>(value)
  const [prev, setPrev] = useState<Channel | null>(value)
  if (value !== prev) {
    // Nouvelle ouverture : on repart de la valeur fournie
    setPrev(value)
    setCh(value)
  }
  if (!ch) return <Dialog open={false} />
  const def = CHANNELS[ch.type]
  const missing = def.fields.some((f) => f.required && !ch.config[f.key])
  const set = (k: string, v: string) => setCh({ ...ch, config: { ...ch.config, [k]: v } })

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <def.icon className="size-4 text-primary" />
            {def.label}
          </DialogTitle>
          <DialogDescription>{t(`ch.help.${ch.type}` as TranslationKey)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("ch.name")}</Label>
            <Input value={ch.name} onChange={(e) => setCh({ ...ch, name: e.target.value })} />
          </div>
          {def.fields.map((f) => (
            <div key={f.key} className={cn("space-y-1.5", (f.key === "url" || f.key === "bot_token" || f.key === "to") && "sm:col-span-2")}>
              <Label>
                {t(f.label)}
                {f.required && <span className="text-destructive">*</span>}
              </Label>
              {f.options ? (
                <div className="flex rounded-lg border p-0.5 text-xs">
                  {f.options.map((o) => (
                    <button
                      key={o}
                      onClick={() => set(f.key, o)}
                      className={cn(
                        "flex-1 rounded-md px-2 py-1.5 font-medium",
                        (ch.config[f.key] || f.options![0]) === o ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                      )}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              ) : (
                <Input
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  placeholder={ch.config[f.key] === SECRET_PLACEHOLDER ? "••••••••" : f.placeholder}
                  value={ch.config[f.key] === SECRET_PLACEHOLDER ? "" : (ch.config[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                  onBlur={(e) => {
                    // Champ secret laissé vide alors qu'une valeur existe déjà → on la conserve
                    if (f.secret && !e.target.value && value?.config[f.key] === SECRET_PLACEHOLDER) set(f.key, SECRET_PLACEHOLDER)
                  }}
                />
              )}
              {f.secret && value?.config[f.key] === SECRET_PLACEHOLDER && (
                <p className="text-[11px] text-muted-foreground">{t("ch.secretKept")}</p>
              )}
            </div>
          ))}
          <div className="space-y-1.5">
            <Label>{t("notif.minSeverity")}</Label>
            <div className="flex rounded-lg border p-0.5 text-xs">
              {(["info", "warning", "critical"] as Severity[]).map((sv) => (
                <button
                  key={sv}
                  onClick={() => setCh({ ...ch, min_severity: sv })}
                  className={cn("flex-1 rounded-md px-2 py-1.5 font-medium", ch.min_severity === sv ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                  {t(`sev.${sv}` as TranslationKey)}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="accent-[var(--primary)]" checked={ch.enabled} onChange={(e) => setCh({ ...ch, enabled: e.target.checked })} />
            {t("notif.enabled")}
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={missing}
            onClick={() => {
              // Secret jamais retapé → on renvoie le marqueur pour que le serveur garde l'ancienne valeur
              const config = { ...ch.config }
              for (const f of def.fields) if (f.secret && !config[f.key] && value?.config[f.key] === SECRET_PLACEHOLDER) config[f.key] = SECRET_PLACEHOLDER
              onSave({ ...ch, config })
            }}
          >
            <Save />
            {t("settings.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
