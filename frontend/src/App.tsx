import { Loader2 } from "lucide-react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AlertsProvider } from "@/hooks/AlertsProvider"
import { DashboardProvider } from "@/hooks/DashboardProvider"
import { useAuth } from "@/hooks/AuthProvider"
import { useI18n } from "@/i18n/I18nProvider"
import { Layout } from "@/layout/Layout"
import { navigation } from "@/layout/navigation"
import { Toaster } from "@/components/ui/sonner"
import { ComingSoon } from "@/pages/ComingSoon"
import { Dashboard } from "@/pages/Dashboard"
import { AlertsPage } from "@/pages/AlertsPage"
import { BackupsPage } from "@/pages/BackupsPage"
import { SnapshotsPage } from "@/pages/SnapshotsPage"
import { DockerPage } from "@/pages/DockerPage"
import { GuestsPage } from "@/pages/GuestsPage"
import { NetworkPage } from "@/pages/NetworkPage"
import { NodesPage } from "@/pages/NodesPage"
import { StoragePage } from "@/pages/StoragePage"
import { TasksPage } from "@/pages/TasksPage"
import { LoginPage } from "@/pages/LoginPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { SetupPage } from "@/pages/SetupPage"
import { ApiErrorBanner } from "@/components/dashboard/SourceAlerts"

// Sections encore à venir
const IMPLEMENTED = new Set(["/", "/nodes", "/vms", "/lxc", "/docker", "/storage", "/network", "/backups", "/tasks"])
const placeholderRoutes = navigation.flatMap((s) => s.items).filter((i) => !IMPLEMENTED.has(i.to))

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
      <AlertsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/nodes" element={<NodesPage />} />
            <Route path="/vms" element={<GuestsPage key="qemu" type="qemu" />} />
            <Route path="/lxc" element={<GuestsPage key="lxc" type="lxc" />} />
            <Route path="/docker" element={<DockerPage />} />
            <Route path="/storage" element={<StoragePage />} />
            <Route path="/network" element={<NetworkPage />} />
            <Route path="/backups" element={<BackupsPage />} />
            <Route path="/snapshots" element={<SnapshotsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            {placeholderRoutes.map((item) => (
              <Route key={item.to} path={item.to} element={<ComingSoon title={item.label} />} />
            ))}
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
      </AlertsProvider>
    </DashboardProvider>
  )
}
