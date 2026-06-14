"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Clock,
  FileText,
  TrendingDown,
  TrendingUp,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type MetricTrend = "up" | "critical" | "down" | "good"

type RiskLevel = "Crítico" | "Médio" | "Baixo"
type DashboardCase = {
  id: string | number
  externalId: string
  category: string
  risk: RiskLevel
  lastInteraction: string
  status: string
  abandonedBySilence?: boolean
  escalatedTo?: string | null
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  if (risk === "Crítico")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Crítico
      </span>
    )
  if (risk === "Médio")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
        Médio
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium bg-muted text-muted-foreground border border-border">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
      Baixo
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Escalonado")
    return <Badge className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">{status}</Badge>
  if (status === "Em Análise")
    return <Badge variant="secondary" className="text-xs">{status}</Badge>
  return <Badge variant="outline" className="text-xs">{status}</Badge>
}

export default function DashboardPage() {
  const router = useRouter()
  const [cases, setCases] = useState<DashboardCase[]>([])
  const [flowFilter, setFlowFilter] = useState<"all" | "abandoned">("all")
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [metrics, setMetrics] = useState([
    {
      label: "Casos Ativos",
      value: "0",
      change: "Em andamento no tenant",
      trend: "up" as MetricTrend,
      icon: FileText,
    },
    {
      label: "SLA vence hoje",
      value: "0",
      change: "Primeira resposta ou resolução",
      trend: "critical" as MetricTrend,
      icon: Clock,
    },
    {
      label: "SLA em atraso",
      value: "0",
      change: "Requer ação do conselho",
      trend: "critical" as MetricTrend,
      icon: AlertTriangle,
    },
    {
      label: "Abandonados",
      value: "0",
      change: "Encaminhados por silêncio",
      trend: "down" as MetricTrend,
      icon: TrendingDown,
    },
  ])

  useEffect(() => {
    const loadDashboard = async () => {
      setIsLoading(true)
      setLoadError("")
      try {
        const response = await fetch("/api/dashboard/cases", { cache: "no-store" })
        if (response.status === 401) {
          router.push("/auth/login")
          return
        }

        if (!response.ok) {
          setLoadError("Não foi possível carregar os dados do dashboard.")
          return
        }

        const data = await response.json()
        setCases(data.cases ?? [])
        setMetrics((prev) => [
          { ...prev[0], value: String(data.metrics?.activeCases ?? 0) },
          {
            ...prev[1],
            value: String(data.metrics?.sla?.dueToday ?? 0),
            trend: (data.metrics?.sla?.dueToday ?? 0) > 0 ? "critical" : "up",
          },
          {
            ...prev[2],
            value: String(data.metrics?.sla?.overdue ?? 0),
            trend: (data.metrics?.sla?.overdue ?? 0) > 0 ? "critical" : "good",
          },
          {
            ...prev[3],
            value: String(data.metrics?.sla?.abandoned ?? 0),
            trend: (data.metrics?.sla?.abandoned ?? 0) > 0 ? "critical" : "good",
          },
        ])
      } catch {
        setLoadError("Falha de conexão ao carregar dashboard.")
      } finally {
        setIsLoading(false)
      }
    }

    void loadDashboard()
  }, [router])

  const visibleCases = useMemo(() => {
    if (flowFilter === "abandoned") {
      return cases.filter((item) => Boolean(item.abandonedBySilence))
    }
    return cases
  }, [cases, flowFilter])

  return (
    <div className="px-6 py-8 space-y-8">
      {/* Page header */}
      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Painel</p>
        <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-card border border-border rounded-sm p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <metric.icon
                className={`h-4 w-4 ${
                  metric.trend === "critical"
                    ? "text-red-500"
                    : "text-muted-foreground"
                }`}
              />
            </div>
            <p
              className={`text-3xl font-bold font-mono tracking-tight ${
                metric.trend === "critical" ? "text-red-600 dark:text-red-400" : "text-foreground"
              }`}
            >
              {metric.value}
            </p>
            <div className="flex items-center gap-1">
              {metric.trend === "down" ? (
                <TrendingDown className="h-3 w-3 text-green-600 dark:text-green-400" />
              ) : metric.trend === "up" ? (
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
              ) : metric.trend === "good" ? (
                <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400" />
              ) : (
                <AlertTriangle className="h-3 w-3 text-red-500" />
              )}
              <p
                className={`text-xs ${
                  metric.trend === "critical"
                    ? "text-red-600 dark:text-red-400"
                    : metric.trend === "down" || metric.trend === "good"
                    ? "text-green-700 dark:text-green-400"
                    : "text-muted-foreground"
                }`}
              >
                {metric.change}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Cases table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold">Denúncias Recentes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Últimas interações registradas</p>
          </div>
          <div className="flex items-center gap-2">
            {([
              { id: "all", label: "Todos" },
              { id: "abandoned", label: "Abandonados" },
            ] as const).map((option) => (
              <button
                key={option.id}
                onClick={() => setFlowFilter(option.id)}
                className={`px-3 py-1.5 text-xs font-medium border rounded-sm transition-colors ${
                  flowFilter === option.id
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
            <Link href="/dashboard/casos">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                Ver todos
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="border border-border rounded-sm overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1.5fr_2fr_1fr_1.5fr_1.5fr_40px] gap-4 px-5 py-3 bg-secondary border-b border-border">
            {["ID do Caso", "Categoria", "Risco", "Última Interação", "Status", ""].map((col) => (
              <p key={col} className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{col}</p>
            ))}
          </div>

          {/* Table rows */}
          <div className="divide-y divide-border">
            {isLoading && (
              <div className="px-5 py-4 text-sm text-muted-foreground">Carregando casos...</div>
            )}
            {!isLoading && loadError && (
              <div className="px-5 py-4 text-sm text-red-600 dark:text-red-400">{loadError}</div>
            )}
            {!isLoading && !loadError && visibleCases.length === 0 && (
              <div className="px-5 py-4 text-sm text-muted-foreground">Nenhum caso encontrado para este tenant.</div>
            )}
            {!isLoading && !loadError && visibleCases.map((c) => (
              <Link
                key={String(c.id)}
                href={`/dashboard/casos/${c.externalId.toLowerCase().replace("caso-", "")}`}
                className="flex flex-col md:grid md:grid-cols-[1.5fr_2fr_1fr_1.5fr_1.5fr_40px] gap-2 md:gap-4 px-5 py-4 items-start md:items-center hover:bg-secondary/50 transition-colors group"
              >
                <span className="font-mono text-xs font-semibold text-foreground">{c.externalId}</span>
                <span className="text-sm text-foreground">{c.category}</span>
                <RiskBadge risk={c.risk} />
                <span className="text-sm text-muted-foreground font-mono">{c.lastInteraction}</span>
                <div className="flex flex-col gap-1">
                  <StatusBadge status={c.status} />
                  {c.abandonedBySilence ? (
                    <span className="text-[10px] text-amber-700 dark:text-amber-300">
                      Encaminhado por ausência de resposta
                    </span>
                  ) : null}
                  {c.status === "Escalonado" && c.escalatedTo ? (
                    <span className="text-[10px] text-muted-foreground">Responsável: {c.escalatedTo}</span>
                  ) : null}
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors hidden md:block" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
