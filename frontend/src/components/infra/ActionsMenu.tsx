import { Archive, FileText, MoreHorizontal } from "lucide-react"
import { useState } from "react"

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
import { BackupDialog } from "@/components/infra/BackupDialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useDashboard } from "@/hooks/DashboardProvider"
import { useActions } from "@/hooks/useActions"
import { useI18n } from "@/i18n/I18nProvider"
import type { TranslationKey } from "@/i18n/translations"
import { availableActions, type ActionDef } from "@/lib/actions"
import type { ContainerAction, Guest, GuestAction } from "@/lib/api"

export function ActionsMenu({ guest, onLogs, align = "end" }: { guest: Guest; onLogs?: () => void; align?: "start" | "end" }) {
  const { t } = useI18n()
  const { data } = useDashboard()
  const { guestAction, containerAction } = useActions()
  const [pending, setPending] = useState<ActionDef | null>(null)
  const [backupOpen, setBackupOpen] = useState(false)
  const enabled = data?.actions_enabled ?? true
  const actions = availableActions(guest)

  const run = (def: ActionDef) => {
    if (guest.type === "docker") containerAction(guest, def.action as ContainerAction)
    else guestAction(guest, def.action as GuestAction)
  }
  const select = (def: ActionDef) => (def.confirm ? setPending(def) : run(def))

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={t("common.actions")} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-48" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel className="truncate">{guest.name}</DropdownMenuLabel>
          {actions.map((def) => (
            <DropdownMenuItem
              key={def.action}
              disabled={!enabled}
              onSelect={() => select(def)}
              className={def.destructive ? "text-destructive focus:text-destructive [&_svg]:text-destructive!" : ""}
            >
              <def.icon />
              {t(`act.${def.action}` as TranslationKey)}
            </DropdownMenuItem>
          ))}
          {!enabled && <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("act.disabled")}</div>}
          {guest.type !== "docker" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!enabled} onSelect={() => setBackupOpen(true)}>
                <Archive />
                {t("act.backup")}
              </DropdownMenuItem>
            </>
          )}
          {onLogs && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onLogs}>
                <FileText />
                {t("act.logs")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <BackupDialog guest={backupOpen ? guest : null} onClose={() => setBackupOpen(false)} />

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending &&
                t("act.confirmTitle")
                  .replace("{action}", t(`act.${pending.action}` as TranslationKey))
                  .replace("{name}", guest.name)}
            </AlertDialogTitle>
            <AlertDialogDescription>{pending?.confirm && t(pending.confirm)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction destructive={pending?.destructive} onClick={() => pending && run(pending)}>
              {pending && t(`act.${pending.action}` as TranslationKey)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** Bouton principal unique (démarrer / éteindre), utilisé dans les panneaux de détail. */
export function QuickActions({ guest }: { guest: Guest }) {
  const { t } = useI18n()
  const { data } = useDashboard()
  const { guestAction, containerAction } = useActions()
  const enabled = data?.actions_enabled ?? true
  const primary = availableActions(guest).find((a) => !a.confirm)
  if (!primary) return null
  return (
    <Button
      size="sm"
      disabled={!enabled}
      onClick={() =>
        guest.type === "docker" ? containerAction(guest, primary.action as ContainerAction) : guestAction(guest, primary.action as GuestAction)
      }
    >
      <primary.icon className="size-4" />
      {t(`act.${primary.action}` as TranslationKey)}
    </Button>
  )
}
