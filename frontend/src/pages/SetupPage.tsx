import { KeyRound, Loader2 } from "lucide-react"
import { useState, type FormEvent } from "react"

import { AuthLayout, FormError } from "@/components/auth/AuthLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/AuthProvider"
import { useI18n } from "@/i18n/I18nProvider"
import { authErrorMessage } from "@/lib/authErrors"

export function SetupPage({ minLength }: { minLength: number }) {
  const { t } = useI18n()
  const { setup } = useAuth()
  const [token, setToken] = useState("")
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return setError(t("auth.err.mismatch"))
    if (password.length < minLength) return setError(t("auth.err.passwordShort"))
    setBusy(true)
    setError(null)
    try {
      await setup(token, username, password)
    } catch (err) {
      setError(authErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title={t("auth.setup.title")} subtitle={t("auth.setup.subtitle")}>
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label htmlFor="token">{t("auth.setup.token")}</Label>
          <Input
            id="token"
            required
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("auth.setup.tokenHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">{t("auth.username")}</Label>
          <Input id="username" required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <Input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={minLength}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("auth.passwordRule").replace("{n}", String(minLength))}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{t("auth.confirm")}</Label>
          <Input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {t("auth.setup.submit")}
        </Button>
      </form>
    </AuthLayout>
  )
}
