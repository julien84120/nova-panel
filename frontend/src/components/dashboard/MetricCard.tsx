import type { LucideIcon } from "lucide-react"
import { TrendingDown, TrendingUp } from "lucide-react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"

import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface MetricCardProps {
  label: string
  value: string
  unit?: string
  detail: string
  icon: LucideIcon
  percent?: number
  trend?: { value: number; label: string }
  spark?: number[]
  color?: string // variable CSS, ex. "var(--chart-1)"
  /** Si vrai, la barre reste de la couleur de la carte (pas d'alerte orange/rouge). */
  neutralBar?: boolean
}

export function MetricCard({ label, value, unit, detail, icon: Icon, percent, trend, spark, color = "var(--chart-1)", neutralBar = false }: MetricCardProps) {
  const level = percent === undefined || neutralBar ? null : percent >= 85 ? "high" : percent >= 65 ? "mid" : "low"
  const sparkData = spark?.map((v, i) => ({ i, v }))
  const gid = `spark-${label.replace(/\W/g, "")}`

  return (
    <Card className="relative gap-0 overflow-hidden py-0 transition-colors hover:border-primary/30">
      <div className="p-5 pb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <span
            className="flex size-8 items-center justify-center rounded-lg"
            style={{ background: `color-mix(in oklch, ${color} 15%, transparent)`, color }}
          >
            <Icon className="size-4" />
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>

        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{detail}</span>
          {trend && (
            <span
              className={cn(
                "ml-auto inline-flex shrink-0 items-center gap-0.5 font-medium",
                trend.value >= 0 ? "text-warning" : "text-success"
              )}
              title={trend.label}
            >
              {trend.value >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {Math.abs(trend.value)}%
            </span>
          )}
        </div>

        {percent !== undefined && (
          <Progress
            value={percent}
            className="mt-4"
            indicatorClassName={cn(level === "high" ? "bg-destructive" : level === "mid" ? "bg-warning" : "")}
            indicatorStyle={neutralBar ? { background: color } : undefined}
          />
        )}
      </div>

      {sparkData && (
        <div className="-mt-2 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${gid})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
