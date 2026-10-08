import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n/I18nProvider"
import type { Task } from "@/lib/api"
import { taskLabel } from "@/lib/labels"
import { timeAgo } from "@/lib/utils"


export function RecentTasks({ tasks: allTasks, limit = 8 }: { tasks: Task[]; limit?: number }) {
  const tasks = allTasks.slice(0, limit)
  const { t, lang } = useI18n()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dash.activity")}</CardTitle>
        <CardDescription>{t("dash.activityDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {tasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("dash.noTasks")}</p>
        ) : (
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
                      <div className="font-medium">{taskLabel(task.type, lang)}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {task.target}
                        {task.user && <span className="ml-1.5 opacity-70">· {task.user}</span>}
                      </div>
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
                    <td className="px-5 py-3 text-right text-xs whitespace-nowrap text-muted-foreground">
                      {timeAgo(task.started_at, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
