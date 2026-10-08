import { Loader2 } from "lucide-react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { DashboardProvider } from "@/hooks/DashboardProvider"
import { useAuth } from "@/hooks/AuthProvider"
import { useI18n } from "@/i18n/I18nProvider"
import { Layout } from "@/layout/Layout"
import { navigation } from "@/layout/navigation"
import { ComingSoon } from "@/pages/ComingSoon"
import { Dashboard } from "@/pages/Dashboard"
import { LoginPage } from "@/pages/LoginPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { SetupPage } from "@/pages/SetupPage"
import { ApiErrorBanner } from "@/components/dashboard/SourceAlerts"

const placeholderRoutes = navigation.flatMap((s) => s.items).filter((i) => i.to !== "/")

export default function App() {
  const { status, error } = useAuth()
  const { t } = useI18n()

  if (!status) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        {error ? (
          <div className="w-full max-w-md">
            <ApiErrorBanner message={error} />
          </div>
        ) : (
          <Loader2 className="size-6 animate-spin text-primary" aria-label={t("auth.loading")} />
        )}
      </div>
    )
  }
  if (status.setup_required) return <SetupPage minLength={status.min_password_length} />
  if (!status.authenticated) return <LoginPage />

  return (
    <DashboardProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            {placeholderRoutes.map((item) => (
              <Route key={item.to} path={item.to} element={<ComingSoon title={item.label} />} />
            ))}
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DashboardProvider>
  )
}
