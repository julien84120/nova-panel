import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]

/** Formate un nombre d'octets → "12.3 GiB". `split` renvoie [valeur, unité]. */
export function formatBytes(bytes: number, digits = 1): string {
  const [v, u] = splitBytes(bytes, digits)
  return `${v} ${u}`
}

export function splitBytes(bytes: number, digits = 1): [string, string] {
  if (!bytes || bytes < 0) return ["0", "B"]
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const v = bytes / 1024 ** i
  return [v.toFixed(i === 0 ? 0 : digits), UNITS[i]]
}

export function pct(used: number, total: number) {
  return total > 0 ? Math.round((used / total) * 100) : 0
}

export function formatUptime(seconds: number, lang: "fr" | "en") {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const dl = lang === "fr" ? "j" : "d"
  return d > 0 ? `${d}${dl} ${h}h` : `${h}h ${m}m`
}

export function timeAgo(unix: number, lang: "fr" | "en") {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unix))
  const fr = lang === "fr"
  if (s < 60) return fr ? "à l'instant" : "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return fr ? `il y a ${m} min` : `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return fr ? `il y a ${h} h` : `${h} h ago`
  const d = Math.floor(h / 24)
  return fr ? `il y a ${d} j` : `${d} d ago`
}
