import { Ban, CheckCircle2, KeyRound, Loader2, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { FormError } from "@/components/auth/AuthLayout"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/hooks/AuthProvider"
import { useI18n } from "@/i18n/I18nProvider"
import type { TranslationKey } from "@/i18n/translations"
import { api, type Role, type UserAccount } from "@/lib/api"
import { authErrorMessage } from "@/lib/authErrors"
import { cn, timeAgo } from "@/lib/utils"

const ROLES: Role[] = ["viewer", "operator", "admin"]

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useI18n()
  const variant = role === "admin" ? "default" : role === "operator" ? "warning" : "secondary"
  return <Badge variant={variant}>{t(`role.${role}` as TranslationKey)}</Badge>
}

function RolePicker({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  const { t } = useI18n()
  return (
    <div className="flex rounded-lg border p-0.5 text-xs">
      {ROLES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={cn(
            "flex-1 rounded-md px-2.5 py-1.5 font-medium whitespace-nowrap",
            value === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t(`role.${r}` as TranslationKey)}
        </button>
      ))}
    </div>
  )
}

export function UsersSettings() {
  const { t, lang } = useI18n()
  const { status } = useAuth()
  const me = status?.user?.username
  const [users, setUsers] = useState<UserAccount[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [resetFor, setResetFor] = useState<UserAccount | null>(null)
  const [deleteFor, setDeleteFor] = useState<UserAccount | null>(null)

  const load = useCallback(
    () =>
      api.users
        .list()
        .then(setUsers)
        .catch((e: unknown) => toast.error(authErrorMessage(e, t))),
    [t]
  )
  useEffect(() => {
    const id = window.setTimeout(load, 0)
    return () => window.clearTimeout(id)
  }, [load])

  const patch = async (u: UserAccount, p: { role?: Role; disabled?: boolean }) => {
    try {
      await api.users.update(u.id, p)
      toast.success(t("users.updated").replace("{name}", u.username))
    } catch (e) {
      toast.error(authErrorMessage(e, t))
    }
    load()
  }

  return (
    <div className="space-y-4">
      <Card className="gap-0 pb-0">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
          <div className="space-y-1.5">
            <CardTitle>{t("users.title")}</CardTitle>
            <CardDescription>{t("users.desc")}</CardDescription>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus />
            {t("users.add")}
          </Button>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("users.user")}</TableHead>
              <TableHead>{t("users.role")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("users.lastLogin")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("users.sessions")}</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!users && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            )}
            {users?.map((u) => {
              const self = u.username === me
              return (
                <TableRow key={u.id} className={cn(u.disabled && "opacity-60")}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 items-center justify-center rounded-full bg-primary/12 text-primary">
                        <UserRound className="size-4" />
                      </span>
                      <div>
                        <div className="font-medium">
                          {u.username}
                          {self && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({t("users.you")})</span>}
                        </div>
                        {u.disabled && (
                          <Badge variant="destructive" className="mt-0.5">
                            {t("users.disabled")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-64">
                    {self ? <RoleBadge role={u.role} /> : <RolePicker value={u.role} onChange={(r) => r !== u.role && patch(u, { role: r })} />}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {u.last_login ? timeAgo(u.last_login, lang) : t("users.never")}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground tabular-nums lg:table-cell">{u.sessions}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" className="size-8" title={t("users.resetPassword")} onClick={() => setResetFor(u)}>
                      <KeyRound />
                    </Button>
                    {!self && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          title={u.disabled ? t("users.enable") : t("users.disable")}
                          onClick={() => patch(u, { disabled: !u.disabled })}
                        >
                          {u.disabled ? <CheckCircle2 className="text-success" /> : <Ban />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive hover:text-destructive"
                          title={t("users.delete")}
                          onClick={() => setDeleteFor(u)}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            {t("users.rolesTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r} className="rounded-lg border bg-background/40 p-4">
              <RoleBadge role={r} />
              <p className="mt-2 text-sm text-muted-foreground">{t(`role.${r}.desc` as TranslationKey)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <CreateUserDialog open={creating} onClose={() => setCreating(false)} onDone={load} />
      <ResetPasswordDialog user={resetFor} self={resetFor?.username === me} onClose={() => setResetFor(null)} onDone={load} />
      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteFor && t("users.deleteTitle").replace("{name}", deleteFor.username)}</AlertDialogTitle>
            <AlertDialogDescription>{t("users.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={async () => {
                if (!deleteFor) return
                try {
                  await api.users.remove(deleteFor.id)
                  toast.success(t("users.deleted").replace("{name}", deleteFor.username))
                } catch (e) {
                  toast.error(authErrorMessage(e, t))
                }
                load()
              }}
            >
              {t("users.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CreateUserDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n()
  const { status } = useAuth()
  const min = status?.min_password_length ?? 10
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<Role>("viewer")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < min) return setError(t("auth.err.passwordShort"))
    setBusy(true)
    setError(null)
    try {
      await api.users.create(username.trim(), password, role)
      toast.success(t("users.created").replace("{name}", username.trim()))
      setUsername("")
      setPassword("")
      setRole("viewer")
      onClose()
      onDone()
    } catch (err) {
      setError(authErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("users.add")}</DialogTitle>
          <DialogDescription>{t("users.addDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <div className="space-y-2">
            <Label htmlFor="nu-name">{t("users.user")}</Label>
            <Input id="nu-name" autoFocus autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-pw">{t("users.initialPassword")}</Label>
            <Input id="nu-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("users.passwordHint").replace("{n}", String(min))}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("users.role")}</Label>
            <RolePicker value={role} onChange={setRole} />
            <p className="text-xs text-muted-foreground">{t(`role.${role}.desc` as TranslationKey)}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !username.trim() || !password}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}
              {t("users.create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({
  user,
  self,
  onClose,
  onDone,
}: {
  user: UserAccount | null
  self: boolean
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useI18n()
  const { status } = useAuth()
  const min = status?.min_password_length ?? 10
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (password.length < min) return setError(t("auth.err.passwordShort"))
    try {
      await api.users.update(user.id, { password })
      toast.success(t("users.passwordReset").replace("{name}", user.username))
      setPassword("")
      setError(null)
      onClose()
      onDone()
      // Réinitialiser son propre mot de passe ferme aussi sa session : retour à la connexion
      if (self) window.location.reload()
    } catch (err) {
      setError(authErrorMessage(err, t))
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user && t("users.resetTitle").replace("{name}", user.username)}</DialogTitle>
          <DialogDescription>{t(self ? "users.resetSelfDesc" : "users.resetDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <div className="space-y-2">
            <Label htmlFor="rp-pw">{t("users.newPassword")}</Label>
            <Input id="rp-pw" type="password" autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("users.passwordHint").replace("{n}", String(min))}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!password}>
              <KeyRound />
              {t("users.resetPassword")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
