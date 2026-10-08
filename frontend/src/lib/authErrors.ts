import type { TranslationKey } from "@/i18n/translations"
import { ApiError } from "@/lib/api"

/** Traduit une erreur de l'API d'authentification en message lisible. */
export function authErrorMessage(e: unknown, t: (k: TranslationKey) => string): string {
  if (e instanceof ApiError) {
    const map: Record<string, TranslationKey> = {
      invalid_credentials: "auth.err.invalidCredentials",
      invalid_setup_token: "auth.err.invalidToken",
      password_too_short: "auth.err.passwordShort",
      password_too_long: "auth.err.passwordLong",
      invalid_username: "auth.err.invalidUsername",
      username_taken: "auth.err.usernameTaken",
      setup_done: "auth.err.setupDone",
    }
    if (e.detail === "too_many_attempts") {
      return t("auth.err.tooMany").replace("{s}", String(e.retryAfter ?? 60))
    }
    if (map[e.detail]) return t(map[e.detail])
    return `${t("auth.err.generic")} (${e.status} ${e.detail})`
  }
  return t("auth.err.network")
}
