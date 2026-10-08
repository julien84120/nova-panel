import { useAuth } from "@/hooks/AuthProvider"
import { useDashboard } from "@/hooks/DashboardProvider"
import type { Role } from "@/lib/api"

/** Droits de l'utilisateur connecté. Le serveur reste l'autorité : ceci ne fait que masquer l'interface. */
export function usePermissions() {
  const { status } = useAuth()
  const { data } = useDashboard()
  const role: Role = status?.user?.role ?? "viewer"
  return {
    role,
    isAdmin: role === "admin",
    canOperate: role !== "viewer" && (data?.actions_enabled ?? true),
    readOnly: role === "viewer",
  }
}
