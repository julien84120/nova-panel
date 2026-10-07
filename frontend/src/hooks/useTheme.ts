import { useCallback, useEffect, useState } from "react"

type Theme = "dark" | "light"
const STORAGE_KEY = "novapanel.theme"

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(STORAGE_KEY) as Theme) || "dark")

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), [])
  return { theme, toggle }
}
