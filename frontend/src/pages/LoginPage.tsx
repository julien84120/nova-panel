import { Loader2, LogIn } from "lucide-react"
import { useState, type FormEvent } from "react"

import { AuthLayout, FormError } from "@/components/auth/AuthLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/AuthProvider"
import { useI18n } from "@/i18n/I18nProvider"
import { authErrorMessage } from "@/lib/authErrors"

export function LoginPage() {
  const { t } = useI18n()
  const { login } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(username, password)
    } catch (err) {
      setError(authErrorMessage(err, t))
      setPassword("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label htmlFor="username">{t("auth.username")}</Label>
          <Input
            id="username"
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <LogIn />}
          {t("auth.login.submit")}
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-muted-foreground">{t("auth.login.forgot")}</p>
    </AuthLayout>
  )
}
