import { Camera, Cpu, History, Loader2, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActions } from "@/hooks/useActions"
import { usePermissions } from "@/hooks/usePermissions"
import { useI18n } from "@/i18n/I18nProvider"
import { api, type Guest, type Snapshot } from "@/lib/api"
import { timeAgo } from "@/lib/utils"

const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{1,39}$/

/** Liste + actions des snapshots d'un invité (panneau de détail). */
export function SnapshotsSection({ guest }: { guest: Guest }) {
  const { t, lang } = useI18n()
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [rollback, setRollback] = useState<Snapshot | null>(null)
  const [del, setDel] = useState<Snapshot | null>(null)
  const { canOperate: enabled } = usePermissions()
  const type = guest.type as "qemu" | "lxc"

  const load = useCallback(
    () =>
      api
        .guestSnapshots(guest.host, type, guest.id)
        .then((s) => {
          setSnaps(s)
          setError(null)
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))),
    [guest.host, guest.id, type]
  )

  useEffect(() => {
    const id = window.setTimeout(load, 0)
    return () => window.clearTimeout(id)
  }, [load])

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Camera className="size-4 text-primary" />
          {t("snap.title")}
          {snaps && <span className="text-xs text-muted-foreground">({snaps.length})</span>}
        </h3>
        <Button size="sm" variant="outline" disabled={!enabled} onClick={() => setCreating(true)}>
          <Plus />
          {t("snap.create")}
        </Button>
      </div>
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      <div className="divide-y rounded-lg border bg-card">
        {snaps === null && !error && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("common.loading")}
          </div>
        )}
        {snaps?.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("snap.none")}</p>}
        {[...(snaps ?? [])].reverse().map((s) => (
          <div key={s.name} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{s.name}</span>
                {s.vmstate && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Cpu className="size-3" /> RAM
                  </Badge>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {s.snaptime ? timeAgo(s.snaptime, lang) : "—"}
                {s.description && ` · ${s.description}`}
              </div>
            </div>
            <Button size="icon" variant="ghost" className="size-8" title={t("snap.rollback")} disabled={!enabled} onClick={() => setRollback(s)}>
              <History />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-destructive hover:text-destructive"
              title={t("snap.delete")}
              disabled={!enabled}
              onClick={() => setDel(s)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      <CreateSnapshotDialog guest={guest} open={creating} onClose={() => setCreating(false)} onDone={load} />
      <RollbackDialog guest={guest} snapshot={rollback} onClose={() => setRollback(null)} onDone={load} />
      <DeleteSnapshotDialog guest={guest} snapshot={del} onClose={() => setDel(null)} onDone={load} />
    </section>
  )
}

export function CreateSnapshotDialog({
  guest,
  open,
  onClose,
  onDone,
}: {
  guest: Guest
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useI18n()
  const { snapshotOp } = useActions()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [vmstate, setVmstate] = useState(false)
  const valid = NAME_RE.test(name)

  const submit = async () => {
    if (!valid) return
    onClose()
    await snapshotOp(guest, "create", name, { description, vmstate })
    setName("")
    setDescription("")
    setVmstate(false)
    onDone()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("snap.createTitle").replace("{name}", guest.name)}</DialogTitle>
          <DialogDescription>{t("snap.createDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="snapname">{t("snap.name")}</Label>
            <Input
              id="snapname"
              autoFocus
              className="font-mono"
              placeholder="avant-mise-a-jour"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!name && !valid}
            />
            <p className={`text-xs ${name && !valid ? "text-destructive" : "text-muted-foreground"}`}>{t("snap.nameRule")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="snapdesc">{t("snap.description")}</Label>
            <Input id="snapdesc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {guest.type === "qemu" && (
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input type="checkbox" className="mt-0.5 accent-[var(--primary)]" checked={vmstate} onChange={(e) => setVmstate(e.target.checked)} />
              <span>
                <span className="font-medium">{t("snap.vmstate")}</span>
                <span className="block text-xs text-muted-foreground">{t("snap.vmstateHint")}</span>
              </span>
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!valid}>
            <Camera />
            {t("snap.create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function RollbackDialog({
  guest,
  snapshot,
  onClose,
  onDone,
}: {
  guest: Guest
  snapshot: { name: string } | null
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useI18n()
  const { snapshotOp } = useActions()
  const [typed, setTyped] = useState("")
  const ok = !!snapshot && typed === snapshot.name

  const submit = async () => {
    if (!snapshot || !ok) return
    const name = snapshot.name
    setTyped("")
    onClose()
    await snapshotOp(guest, "rollback", name)
    onDone()
  }

  return (
    <Dialog
      open={!!snapshot}
      onOpenChange={(o) => {
        if (!o) {
          setTyped("")
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{snapshot && t("snap.rollbackTitle").replace("{name}", snapshot.name)}</DialogTitle>
          <DialogDescription>{t("snap.rollbackDesc").replace("{guest}", guest.name)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-snap">{t("snap.typeToConfirm").replace("{name}", snapshot?.name ?? "")}</Label>
          <Input id="confirm-snap" className="font-mono" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" disabled={!ok} onClick={submit}>
            <History />
            {t("snap.rollback")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteSnapshotDialog({
  guest,
  snapshot,
  onClose,
  onDone,
}: {
  guest: Guest
  snapshot: { name: string } | null
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useI18n()
  const { snapshotOp } = useActions()
  return (
    <AlertDialog open={!!snapshot} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{snapshot && t("snap.deleteTitle").replace("{name}", snapshot.name)}</AlertDialogTitle>
          <AlertDialogDescription>{t("snap.deleteDesc")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            destructive
            onClick={async () => {
              if (!snapshot) return
              await snapshotOp(guest, "delete", snapshot.name)
              onDone()
            }}
          >
            {t("snap.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
