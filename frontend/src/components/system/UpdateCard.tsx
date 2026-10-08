import { CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n/I18nProvider"
import { api, ApiError, type UpdateStatus } from "@/lib/api"

/** Mise à jour de NovaPanel : déclenche install.sh en arrière-plan (unité systemd) et suit le journal. */
export function UpdateCard() {
  const { t } = useI18n()
  const [st, setSt] = useState<UpdateStatus | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [waiting, setWaiting] = useState(false) // mise à jour lancée depuis cette page
  const startVersion = useRef<string | null>(null)

  useEffect(() => {
    let stop = false
    const tick = () =>
      api.system
        .update()
        .then((s) => {
          if (stop) return
          setSt(s)
          // Le service a redémarré sur une nouvelle version → rechargement de l'interface
          if (startVersion.current && s.current !== startVersion.current) {
            toast.success(t("update.done").replace("{v}", s.current))
            window.setTimeout(() => window.location.reload(), 1500)
          } else if (startVersion.current && !s.running && s.last_exit !== null && s.last_exit !== 0) {
            toast.error(t("update.failed"))
            startVersion.current = null
            setWaiting(false)
          }
        })
        .catch(() => {}) // pendant le redémarrage, l'API ne répond pas : on réessaie
    tick()
    const id = window.setInterval(tick, waiting ? 3000 : 60_000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [waiting, t])

  const start = async () => {
    try {
      startVersion.current = st?.current ?? null
      await api.system.startUpdate()
      setWaiting(true)
      toast.message(t("update.started"))
    } catch (e) {
      startVersion.current = null
      toast.error(e instanceof ApiError ? e.detail : String(e))
    }
  }

  const busy = waiting || !!st?.running
  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="size-4 text-primary" />
          {t("update.title")}
        </CardTitle>
        <CardDescription>
          {st ? t("update.current").replace("{v}", st.current) : "…"}
          {st?.latest && ` · ${t("update.latest").replace("{v}", st.latest)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {st && !st.supported ? (
          <p className="text-sm text-muted-foreground">{t("update.unsupported")}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {st?.available || busy ? (
              <Button onClick={() => setConfirm(true)} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {busy ? t("update.running") : t("update.button").replace("{v}", st?.latest ?? "")}
              </Button>
            ) : (
              <span className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" />
                {t("update.upToDate")}
              </span>
            )}
            {busy && <span className="text-xs text-muted-foreground">{t("update.wait")}</span>}
          </div>
        )}
        {st && st.log.length > 0 && (busy || st.last_exit) ? (
          <pre className="max-h-56 overflow-auto rounded-lg border bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {st.log.join("\n")}
          </pre>
        ) : null}
      </CardContent>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("update.confirmTitle").replace("{v}", st?.latest ?? "")}</AlertDialogTitle>
            <AlertDialogDescription>{t("update.confirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={start}>{t("update.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
