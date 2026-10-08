import { useCallback, useSyncExternalStore } from "react"

type Theme = "dark" | "light"
const STORAGE_KEY = "novapanel.theme"

// Petit store partagé : tous les composants voient le même thème
let current: Theme = (localStorage.getItem(STORAGE_KEY) as Theme) || "dark"
const listeners = new Set<() => void>()
document.documentElement.classList.toggle("dark", current === "dark")

function setTheme(t: Theme) {
  current = t
  localStorage.setItem(STORAGE_KEY, t)
  document.documentElement.classList.toggle("dark", t === "dark")
  listeners.forEach((l) => l())
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current
  )
  const toggle = useCallback(() => setTheme(current === "dark" ? "light" : "dark"), [])
  return { theme, toggle }
}
