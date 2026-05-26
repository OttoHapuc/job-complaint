"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Search, SlidersHorizontal } from "lucide-react"
import { Badge } from "@/components/ui/badge"

type RiskLevel = "Crítico" | "Médio" | "Baixo" | "Sigiloso"
type DashboardCase = {
  id: string
  externalId: string
  category: string
  risk: RiskLevel
  lastInteraction: string
  status: string
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
  if (risk === "Sigiloso")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        Sigiloso
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
  if (status === "Resolvido")
    return <Badge className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">{status}</Badge>
  if (status === "Em Análise")
    return <Badge variant="secondary" className="text-xs">{status}</Badge>
  return <Badge variant="outline" className="text-xs">{status}</Badge>
}

export default function CasosPage() {
  const router = useRouter()
  const [cases, setCases] = useState<DashboardCase[]>([])
  const [search, setSearch] = useState("")
  const [filterRisk, setFilterRisk] = useState<"all" | RiskLevel>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    let active = true

    const loadCases = async () => {
      try {
        const response = await fetch("/api/dashboard/cases", { cache: "no-store" })
        if (response.status === 401) {
          router.push("/auth/login")
          return
        }
        const data = await response.json().catch(() => ({}))
        if (!active) return

        if (!response.ok) {
          setLoadError(data.error ?? "Não foi possível carregar os casos.")
          return
        }

        setCases(data.cases ?? [])
        setLoadError("")
      } catch {
        if (active) {
          setLoadError("Falha de conexão ao carregar os casos.")
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void loadCases()

    return () => {
      active = false
    }
  }, [router])

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      const matchSearch =
        c.externalId.toLowerCase().includes(search.toLowerCase()) ||
        c.category.toLowerCase().includes(search.toLowerCase())
      const matchRisk = filterRisk === "all" || c.risk === filterRisk
      return matchSearch && matchRisk
    })
  }, [cases, search, filterRisk])

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Dashboard</p>
        <h1 className="text-2xl font-bold tracking-tight">Caixa de Casos</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID ou categoria..."
            className="w-full bg-background border border-border rounded-sm pl-9 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          {(["all", "Crítico", "Médio", "Baixo"] as const).map((level) => (
            <button
              key={level}
              onClick={() => setFilterRisk(level)}
              className={`px-3 py-2 text-xs font-medium border rounded-sm transition-colors ${
                filterRisk === level
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {level === "all" ? "Todos" : level}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[1.5fr_2fr_1fr_1.5fr_1.5fr_40px] gap-4 px-5 py-3 bg-secondary border-b border-border">
          {["ID do Caso", "Categoria", "Risco", "Última Interação", "Status", ""].map((col) => (
            <p key={col} className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{col}</p>
          ))}
        </div>
        {isLoading ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            Carregando casos do tenant...
          </div>
        ) : loadError ? (
          <div className="px-5 py-12 text-center text-sm text-red-600 dark:text-red-400">
            {loadError}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            Nenhum caso encontrado com os filtros aplicados.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/casos/${c.externalId.toLowerCase().replace("caso-", "")}`}
                className="flex flex-col md:grid md:grid-cols-[1.5fr_2fr_1fr_1.5fr_1.5fr_40px] gap-2 md:gap-4 px-5 py-4 items-start md:items-center hover:bg-secondary/50 transition-colors group"
              >
                <span className="font-mono text-xs font-semibold text-foreground">{c.externalId}</span>
                <span className="text-sm text-foreground">{c.category}</span>
                <RiskBadge risk={c.risk} />
                <span className="text-sm text-muted-foreground font-mono">{c.lastInteraction}</span>
                <div className="flex flex-col gap-1">
                  <StatusBadge status={c.status} />
                  {c.status === "Escalonado" && c.escalatedTo ? (
                    <span className="text-[10px] text-muted-foreground">Responsável: {c.escalatedTo}</span>
                  ) : null}
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors hidden md:block" />
              </Link>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {isLoading ? "Carregando..." : `${filtered.length} caso(s) exibido(s)`}
      </p>
    </div>
  )
}
