import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Task } from "@/data/mock"
import { useI18n } from "@/i18n/I18nProvider"

export function RecentTasks({ tasks }: { tasks: Task[] }) {
  const { t, lang } = useI18n()

  const ago = (m: number) => {
    if (m < 60) return lang === "fr" ? `il y a ${m} min` : `${m} min ago`
    const h = Math.floor(m / 60)
    return lang === "fr" ? `il y a ${h} h` : `${h} h ago`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dash.activity")}</CardTitle>
        <CardDescription>{t("dash.activityDesc")}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" className="text-primary">
            {t("dash.viewAll")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-5 py-2 font-medium">{t("dash.name")}</th>
                <th className="px-3 py-2 font-medium">{t("dash.host")}</th>
                <th className="px-3 py-2 font-medium">{t("dash.status")}</th>
                <th className="px-5 py-2 text-right font-medium">{t("dash.when")}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="px-5 py-3">
                    <div className="font-medium">{task.label[lang]}</div>
                    <div className="font-mono text-xs text-muted-foreground">{task.target}</div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{task.host}</td>
                  <td className="px-3 py-3">
                    {task.status === "ok" && (
                      <Badge variant="success">
                        <CheckCircle2 /> {t("task.ok")}
                      </Badge>
                    )}
                    {task.status === "running" && (
                      <Badge variant="default">
                        <Loader2 className="animate-spin" /> {t("task.running")}
                      </Badge>
                    )}
                    {task.status === "error" && (
                      <Badge variant="destructive">
                        <XCircle /> {t("task.error")}
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-xs whitespace-nowrap text-muted-foreground">{ago(task.minutesAgo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
