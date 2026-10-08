import { useId } from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { useI18n } from "@/i18n/I18nProvider"
import type { HistoryPoint, Timeframe } from "@/lib/api"
import { formatBytes } from "@/lib/utils"

const fmt = (tf: Timeframe) => (t: number) => {
  const d = new Date(t * 1000)
  return tf === "hour" || tf === "day"
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "2-digit", month: "2-digit" })
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
}

/** Graphique CPU / mémoire (%) — ou trafic réseau si `network`. */
export function HistoryChart({
  data,
  timeframe,
  network = false,
  height = 200,
}: {
  data: HistoryPoint[]
  timeframe: Timeframe
  network?: boolean
  height?: number
}) {
  const { t } = useI18n()
  const tick = fmt(timeframe)
  const [a, b] = network ? (["netin", "netout"] as const) : (["cpu", "memory"] as const)
  const label = (k: string) =>
    k === "cpu" ? t("dash.cpu") : k === "memory" ? t("dash.memory") : k === "netin" ? t("net.in") : t("net.out")
  const value = (v: number) => (network ? `${formatBytes(v)}/s` : `${Math.round(v)}%`)
  const id = `${network ? "net" : "res"}-${useId().replace(/:/g, "")}`

  const legend = (
    <div className="mb-1 flex gap-4 text-xs text-muted-foreground">
      {[a, b].map((k, i) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i === 0 ? "var(--chart-1)" : "var(--chart-2)" }} />
          {label(k)}
        </span>
      ))}
    </div>
  )

  if (data.length < 2) {
    return <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>{t("common.loading")}</div>
  }
  return (
    <div>
      {legend}
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={tick}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <YAxis
          tickFormatter={(v) => (network ? `${formatBytes(v, 0)}/s` : `${v}%`)}
          tickCount={network ? 4 : 5}
          ticks={network ? undefined : [0, 25, 50, 75, 100]}
          tickLine={false}
          axisLine={false}
          width={network ? 84 : 48}
          domain={network ? [0, (max: number) => Math.ceil(max * 1.15)] : [0, 100]}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          labelFormatter={(v) => new Date(Number(v) * 1000).toLocaleString()}
          contentStyle={tooltipStyle}
          formatter={(v, name) => [value(Number(v)), label(String(name))]}
        />
        <Area type="monotone" dataKey={b} stroke="var(--chart-2)" strokeWidth={1.75} fill={`url(#${id}-b)`} isAnimationActive={false} />
        <Area type="monotone" dataKey={a} stroke="var(--chart-1)" strokeWidth={1.75} fill={`url(#${id}-a)`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
    </div>
  )
}
