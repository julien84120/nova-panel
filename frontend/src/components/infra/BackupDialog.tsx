import { Archive } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useDashboard } from "@/hooks/DashboardProvider"
import { useActions } from "@/hooks/useActions"
import { usePermissions } from "@/hooks/usePermissions"
import { useI18n } from "@/i18n/I18nProvider"
import type { TranslationKey } from "@/i18n/translations"
import type { Guest } from "@/lib/api"
import { cn, formatBytes } from "@/lib/utils"

type Mode = "snapshot" | "suspend" | "stop"

export function BackupDialog({ guest, onClose }: { guest: Guest | null; onClose: () => void }) {
  const { canOperate } = usePermissions()
  const { t } = useI18n()
  const { data } = useDashboard()
  const { backupGuest } = useActions()
  const targets = (data?.storages ?? []).filter((s) => s.kind === "proxmox" && s.content.includes("backup") && s.status === "available")
  const [storage, setStorage] = useState("")
  const [mode, setMode] = useState<Mode>("snapshot")
  const selected = storage || targets[0]?.name || ""

  const submit = () => {
    if (!guest || !selected) return
    void backupGuest(guest, selected, mode)
    onClose()
  }

  return (
    <Dialog open={!!guest} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="size-4 text-primary" />
            {guest && t("backup.dialogTitle").replace("{name}", guest.name)}
          </DialogTitle>
          <DialogDescription>{t("backup.dialogDesc")}</DialogDescription>
        </DialogHeader>

        {targets.length === 0 ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">{t("backup.noStorage")}</p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>{t("backup.storage")}</Label>
              <div className="grid gap-2">
                {targets.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStorage(s.name)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      selected === s.name ? "border-primary bg-primary/10" : "hover:bg-accent/40"
                    )}
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.type} · {formatBytes(s.total - s.used)} {t("storage.free").toLowerCase()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("backup.mode")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["snapshot", "suspend", "stop"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      mode === m ? "border-primary bg-primary/10" : "hover:bg-accent/40"
                    )}
                  >
                    {t(`backup.mode.${m}` as TranslationKey)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t(`backup.modeHint.${mode}` as TranslationKey)}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!selected || !canOperate}>
            <Archive />
            {t("act.backup")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
