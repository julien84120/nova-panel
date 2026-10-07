import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { translations, type Lang, type TranslationKey } from "./translations"

type I18nContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)
const STORAGE_KEY = "novapanel.lang"

function detectLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === "fr" || saved === "en") return saved
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en"
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next)
    setLangState(next)
  }, [])

  const t = useCallback((key: TranslationKey) => translations[lang][key] ?? key, [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>")
  return ctx
}
