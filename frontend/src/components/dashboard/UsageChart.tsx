import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { UsagePoint } from "@/data/mock"
import { useI18n } from "@/i18n/I18nProvider"

export function UsageChart({ data }: { data: UsagePoint[] }) {
  const { t } = useI18n()
  const last = data[data.length - 1]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dash.usage")}</CardTitle>
        <CardDescription>{t("dash.usageDesc")}</CardDescription>
        <CardAction className="flex gap-4 text-xs">
          <Legend color="var(--chart-1)" label={t("dash.cpu")} value={`${last.cpu}%`} />
          <Legend color="var(--chart-2)" label={t("dash.memory")} value={`${last.memory}%`} />
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-[280px] flex-1 pl-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="fill-cpu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fill-mem" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              minTickGap={40}
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
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--popover-foreground)",
              }}
              formatter={(v, name) => [`${v}%`, name === "cpu" ? t("dash.cpu") : t("dash.memory")]}
            />
            <Area type="monotone" dataKey="memory" stroke="var(--chart-2)" strokeWidth={2} fill="url(#fill-mem)" isAnimationActive={false} />
            <Area type="monotone" dataKey="cpu" stroke="var(--chart-1)" strokeWidth={2} fill="url(#fill-cpu)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
