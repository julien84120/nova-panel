import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { api, UNAUTHORIZED_EVENT, type AuthStatus } from "@/lib/api"

interface AuthContextValue {
  status: AuthStatus | null
  error: string | null
  reload: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  setup: (token: string, username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setStatus(await api.auth.status())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    api.auth
      .status()
      .then(setStatus)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    const onUnauthorized = () => reload()
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [reload])

  const login = useCallback(
    async (username: string, password: string) => {
      await api.auth.login(username, password)
      await reload()
    },
    [reload]
  )

  const setup = useCallback(
    async (token: string, username: string, password: string) => {
      await api.auth.setup(token, username, password)
      await reload()
    },
    [reload]
  )

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      await reload()
    }
  }, [reload])

  const value = useMemo(() => ({ status, error, reload, login, setup, logout }), [status, error, reload, login, setup, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
