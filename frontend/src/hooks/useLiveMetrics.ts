import { useEffect, useState } from "react"

import { clamp, generateUsageSeries, hosts as initialHosts, type Host, type UsagePoint } from "@/data/mock"

/** CPU (pondéré par cœurs) et RAM agrégés sur tous les hôtes, en %. */
export function aggregate(hosts: Host[]) {
  const cores = hosts.reduce((s, h) => s + h.cores, 0)
  const cpu = hosts.reduce((s, h) => s + h.cpu * h.cores, 0) / cores
  const memUsed = hosts.reduce((s, h) => s + h.memUsed, 0)
  const memTotal = hosts.reduce((s, h) => s + h.memTotal, 0)
  return { cpu: Math.round(cpu), memory: Math.round((memUsed / memTotal) * 100) }
}

function initialState() {
  const series = generateUsageSeries()
  // Recale la série pour que son dernier point corresponde aux hôtes actuels
  const target = aggregate(initialHosts)
  const last = series[series.length - 1]
  const dCpu = target.cpu - last.cpu
  const dMem = target.memory - last.memory
  return {
    hosts: initialHosts,
    series: series.map((p) => ({
      ...p,
      cpu: Math.round(clamp(p.cpu + dCpu, 2, 98)),
      memory: Math.round(clamp(p.memory + dMem, 2, 98)),
    })),
  }
}

/** Simule un flux temps réel : met à jour les hôtes et la série toutes les `intervalMs`.
 *  Au Sprint 2, ce hook sera remplacé par un polling / WebSocket vers l'API FastAPI. */
export function useLiveMetrics(intervalMs = 3000) {
  const [state, setState] = useState<{ hosts: Host[]; series: UsagePoint[] }>(initialState)

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((prev) => {
        const hosts = prev.hosts.map((h) => {
          const cpu = clamp(h.cpu + (Math.random() - 0.5) * 8, 3, 97)
          const memUsed = clamp(h.memUsed + (Math.random() - 0.5) * h.memTotal * 0.02, h.memTotal * 0.2, h.memTotal * 0.97)
          return { ...h, cpu: Math.round(cpu), memUsed: +memUsed.toFixed(1), uptime: h.uptime + intervalMs / 1000 }
        })
        const point: UsagePoint = {
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          ...aggregate(hosts),
        }
        return { hosts, series: [...prev.series.slice(1), point] }
      })
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return state
}
