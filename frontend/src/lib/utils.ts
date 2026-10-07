import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(gib: number, digits = 1) {
  if (gib >= 1024) return `${(gib / 1024).toFixed(digits)} TiB`
  return `${gib.toFixed(digits)} GiB`
}

export function formatUptime(seconds: number, lang: "fr" | "en") {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const dl = lang === "fr" ? "j" : "d"
  return d > 0 ? `${d}${dl} ${h}h` : `${h}h ${m}m`
}
