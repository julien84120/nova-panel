import { useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n/I18nProvider"
import type { TranslationKey } from "@/i18n/translations"
import type { HistoryRange, HostSeries } from "@/lib/api"
import { cn } from "@/lib/utils"

const COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-2)"]

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
}

function timeFmt(range: HistoryRange) {
  return (t: number) => {
    const d = new Date(t * 1000)
    return range === "week"
      ? d.toLocaleDateString([], { weekday: "short", day: "2-digit" })
      : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
}

interface Props {
  series: HostSeries[]
  /** Vue d'un seul hôte : CPU + mémoire superposés. Sinon : une courbe par hôte. */
  single: boolean
  range: HistoryRange
  onRange: (r: HistoryRange) => void
  loading: boolean
}

export function ResourceChart({ series, single, range, onRange, loading }: Props) {
  const { t } = useI18n()
  const [metric, setMetric] = useState<"cpu" | "memory">("cpu")
  const fmt = timeFmt(range)

  // Lignes fusionnées par horodatage : { t, "<hostId>": valeur, ... }
  const rows = useMemo(() => {
    const byT = new Map<number, Record<string, number>>()
    for (const s of series)
      for (const p of s.points) {
        const row = byT.get(p.t) ?? { t: p.t }
        row[s.id] = p[metric]
        byT.set(p.t, row)
      }
    return [...byT.values()].sort((a, b) => a.t - b.t)
  }, [series, metric])

  const host = series[0]
  const last = host?.points[host.points.length - 1]
  const hasData = single ? (host?.points.length ?? 0) > 1 : rows.length > 1

  const rangeToggle = (
    <div className="flex rounded-lg border bg-background/40 p-0.5 text-xs">
      {(["hour", "day", "week"] as const).map((r) => (
        <button
          key={r}
          onClick={() => onRange(r)}
          className={cn(
            "rounded-md px-2 py-0.5 font-medium transition-colors",
            range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t(`tf.${r}` as TranslationKey)}
        </button>
      ))}
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{single && host ? `${t("dash.usage")} — ${host.name}` : t("dash.usage")}</CardTitle>
        <CardDescription>{single ? t("dash.usageHostDesc") : t("dash.usagePerHostDesc")}</CardDescription>
        <CardAction className="flex flex-wrap items-center justify-end gap-2">
          {!single && (
            <div className="flex rounded-lg border bg-background/40 p-0.5 text-xs">
              {(["cpu", "memory"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={cn(
                    "rounded-md px-2 py-0.5 font-medium transition-colors",
                    metric === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(m === "cpu" ? "dash.cpu" : "dash.memory")}
                </button>
              ))}
            </div>
          )}
          {rangeToggle}
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-[300px] flex-1 flex-col gap-3 pl-1">
        {/* Légende */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pl-4 text-xs">
          {single ? (
            <>
              <LegendItem color="var(--chart-1)" label={t("dash.cpu")} value={last ? `${Math.round(last.cpu)}%` : "—"} />
              <LegendItem color="var(--chart-2)" label={t("dash.memory")} value={last ? `${Math.round(last.memory)}%` : "—"} />
            </>
          ) : (
            series.map((s, i) => {
              const lp = s.points[s.points.length - 1]
              return (
                <LegendItem
                  key={s.id}
                  color={COLORS[i % COLORS.length]}
                  label={s.name}
                  value={lp ? `${Math.round(lp[metric])}%` : "—"}
                />
              )
            })
          )}
        </div>

        {!hasData ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {loading ? t("common.loading") : t("dash.collecting")}
          </div>
        ) : (
          <div className="min-h-[250px] flex-1">
            <ResponsiveContainer width="100%" height="100%" minHeight={250}>
              {single ? (
                <AreaChart data={host.points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <defs>
                    <linearGradient id="rc-cpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="rc-mem" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Axes fmt={fmt} />
                  <Tooltip
                    cursor={{ stroke: "var(--border)" }}
                    labelFormatter={(v) => new Date(Number(v) * 1000).toLocaleString()}
                    contentStyle={tooltipStyle}
                    formatter={(v, name) => [`${Math.round(Number(v))}%`, name === "cpu" ? t("dash.cpu") : t("dash.memory")]}
                  />
                  <Area type="monotone" dataKey="memory" stroke="var(--chart-2)" strokeWidth={2} fill="url(#rc-mem)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="cpu" stroke="var(--chart-1)" strokeWidth={2} fill="url(#rc-cpu)" isAnimationActive={false} />
                </AreaChart>
              ) : (
                <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <Axes fmt={fmt} />
                  <Tooltip
                    cursor={{ stroke: "var(--border)" }}
                    labelFormatter={(v) => new Date(Number(v) * 1000).toLocaleString()}
                    contentStyle={tooltipStyle}
                    formatter={(v, id) => [`${Math.round(Number(v))}%`, series.find((s) => s.id === id)?.name ?? String(id)]}
                  />
                  {series.map((s, i) => (
                    <Line
                      key={s.id}
                      type="monotone"
                      dataKey={s.id}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Axes({ fmt }: { fmt: (t: number) => string }) {
  return (
    <>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis
        dataKey="t"
        type="number"
        scale="time"
        domain={["dataMin", "dataMax"]}
        tickFormatter={fmt}
        tickLine={false}
        axisLine={false}
        minTickGap={48}
        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
      />
      <YAxis
        domain={[0, 100]}
        ticks={[0, 25, 50, 75, 100]}
        tickFormatter={(v) => `${v}%`}
        tickLine={false}
        axisLine={false}
        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
      />
    </>
  )
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </span>
  )
}
