"use client"

import { useEffect, useMemo, useState } from "react"
import { ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

type DsrStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "REJECTED"
type DsrType =
  | "ACCESS"
  | "CORRECTION"
  | "ANONYMIZATION"
  | "DELETION"
  | "PORTABILITY"
  | "INFORMATION"

type DataSubjectRequest = {
  id: string
  status: DsrStatus
  requestType: DsrType
  requesterName: string
  requesterEmail: string
  details: string
  dueAt: string | null
  isOverdue: boolean
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

type LgpdOverview = {
  counts: {
    open: number
    inProgress: number
    completed: number
    rejected: number
  }
  sla: {
    overdue: number
    dueSoon24h: number
  }
}

const STATUS_LABEL: Record<DsrStatus, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída",
  REJECTED: "Rejeitada",
}

const TYPE_LABEL: Record<DsrType, string> = {
  ACCESS: "Acesso",
  CORRECTION: "Correção",
  ANONYMIZATION: "Anonimização",
  DELETION: "Eliminação",
  PORTABILITY: "Portabilidade",
  INFORMATION: "Informação",
}

const STATUS_OPTIONS: Array<{ value: "ALL" | DsrStatus; label: string }> = [
  { value: "ALL", label: "Todas" },
  { value: "OPEN", label: "Abertas" },
  { value: "IN_PROGRESS", label: "Em andamento" },
  { value: "COMPLETED", label: "Concluídas" },
  { value: "REJECTED", label: "Rejeitadas" },
]

function statusClassName(status: DsrStatus) {
  if (status === "COMPLETED") return "text-green-700 dark:text-green-400"
  if (status === "REJECTED") return "text-red-700 dark:text-red-400"
  if (status === "IN_PROGRESS") return "text-blue-700 dark:text-blue-400"
  return "text-yellow-700 dark:text-yellow-400"
}

export default function DashboardLgpdPage() {
  const [requests, setRequests] = useState<DataSubjectRequest[]>([])
  const [overview, setOverview] = useState<LgpdOverview | null>(null)
  const [activeStatusFilter, setActiveStatusFilter] = useState<"ALL" | DsrStatus>("ALL")
  const [isLoading, setIsLoading] = useState(false)
  const [isUpdatingId, setIsUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const loadOverview = async () => {
    try {
      const response = await fetch("/api/privacy/data-subject-requests/overview", {
        cache: "no-store",
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        setOverview(data)
      }
    } catch {
      // no-op: a lista principal já exibe erro quando necessário
    }
  }

  const loadRequests = async () => {
    setIsLoading(true)
    setError("")
    try {
      const query = activeStatusFilter === "ALL" ? "" : `?status=${activeStatusFilter}`
      const response = await fetch(`/api/privacy/data-subject-requests${query}`, {
        cache: "no-store",
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error ?? "Não foi possível carregar solicitações.")
        return
      }
      setRequests(data.requests ?? [])
      await loadOverview()
    } catch {
      setError("Falha de conexão ao carregar solicitações.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    const run = async () => {
      try {
        const query = activeStatusFilter === "ALL" ? "" : `?status=${activeStatusFilter}`
        const response = await fetch(`/api/privacy/data-subject-requests${query}`, {
          cache: "no-store",
        })
        const data = await response.json().catch(() => ({}))
        if (!active) return

        if (!response.ok) {
          setError(data.error ?? "Não foi possível carregar solicitações.")
          return
        }

        const overviewResponse = await fetch("/api/privacy/data-subject-requests/overview", {
          cache: "no-store",
        })
        const overviewData = await overviewResponse.json().catch(() => ({}))

        setError("")
        setRequests(data.requests ?? [])
        if (overviewResponse.ok && active) {
          setOverview(overviewData)
        }
      } catch {
        if (active) {
          setError("Falha de conexão ao carregar solicitações.")
        }
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [activeStatusFilter])

  const counts = useMemo(() => {
    if (overview?.counts) {
      return overview.counts
    }
    const open = requests.filter((item) => item.status === "OPEN").length
    const inProgress = requests.filter((item) => item.status === "IN_PROGRESS").length
    const completed = requests.filter((item) => item.status === "COMPLETED").length
    const rejected = requests.filter((item) => item.status === "REJECTED").length
    return { open, inProgress, completed, rejected }
  }, [overview, requests])

  const updateStatus = async (id: string, status: DsrStatus) => {
    setIsUpdatingId(id)
    setError("")
    try {
      const response = await fetch(`/api/privacy/data-subject-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error ?? "Não foi possível atualizar status.")
        return
      }

      setRequests((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status: data.request.status,
                dueAt: data.request.dueAt ?? item.dueAt,
                isOverdue:
                  (data.request.status === "OPEN" || data.request.status === "IN_PROGRESS") &&
                  !!(data.request.dueAt ?? item.dueAt) &&
                  new Date(data.request.dueAt ?? item.dueAt).getTime() < Date.now(),
                updatedAt: data.request.updatedAt,
                resolvedAt: data.request.resolvedAt,
              }
            : item,
        ),
      )
      await loadOverview()
    } catch {
      setError("Falha de conexão ao atualizar status.")
    } finally {
      setIsUpdatingId(null)
    }
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Privacidade</p>
          <h1 className="text-2xl font-bold tracking-tight">Solicitações de Direitos LGPD</h1>
        </div>
        <Button variant="outline" size="sm" onClick={loadRequests} disabled={isLoading}>
          Atualizar
        </Button>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <div className="border border-border rounded-sm p-4 bg-card">
          <p className="text-xs text-muted-foreground">Abertas</p>
          <p className="text-2xl font-semibold">{counts.open}</p>
        </div>
        <div className="border border-border rounded-sm p-4 bg-card">
          <p className="text-xs text-muted-foreground">Em andamento</p>
          <p className="text-2xl font-semibold">{counts.inProgress}</p>
        </div>
        <div className="border border-border rounded-sm p-4 bg-card">
          <p className="text-xs text-muted-foreground">Concluídas</p>
          <p className="text-2xl font-semibold">{counts.completed}</p>
        </div>
        <div className="border border-border rounded-sm p-4 bg-card">
          <p className="text-xs text-muted-foreground">Rejeitadas</p>
          <p className="text-2xl font-semibold">{counts.rejected}</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="border border-border rounded-sm p-4 bg-card">
          <p className="text-xs text-muted-foreground">SLA vencido</p>
          <p className="text-2xl font-semibold text-red-700 dark:text-red-400">
            {overview?.sla.overdue ?? requests.filter((item) => item.isOverdue).length}
          </p>
        </div>
        <div className="border border-border rounded-sm p-4 bg-card">
          <p className="text-xs text-muted-foreground">Vencimento em 24h</p>
          <p className="text-2xl font-semibold">{overview?.sla.dueSoon24h ?? 0}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((status) => (
          <Button
            key={status.value}
            variant={activeStatusFilter === status.value ? "default" : "outline"}
            size="sm"
            className="text-xs"
            onClick={() => setActiveStatusFilter(status.value)}
          >
            {status.label}
          </Button>
        ))}
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

      <div className="space-y-3">
        {requests.length === 0 && !isLoading ? (
          <div className="border border-border rounded-sm p-8 text-center bg-card">
            <ShieldCheck className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma solicitação encontrada para o filtro selecionado.</p>
          </div>
        ) : (
          requests.map((item) => (
            <div key={item.id} className="border border-border rounded-sm p-4 bg-card space-y-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{TYPE_LABEL[item.requestType]} - {item.requesterName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{item.requesterEmail}</p>
                </div>
                <p className={`text-xs font-semibold uppercase tracking-wider ${statusClassName(item.status)}`}>
                  {STATUS_LABEL[item.status]}
                </p>
              </div>

              <p className="text-sm text-muted-foreground">{item.details}</p>

              <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                <span>Protocolo: <span className="font-mono">{item.id}</span></span>
                <span>Abertura: {new Date(item.createdAt).toLocaleString("pt-BR")}</span>
                {item.dueAt ? <span>Prazo SLA: {new Date(item.dueAt).toLocaleString("pt-BR")}</span> : null}
                {item.resolvedAt ? <span>Fechamento: {new Date(item.resolvedAt).toLocaleString("pt-BR")}</span> : null}
              </div>
              {item.isOverdue && (
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">
                  SLA vencido
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={isUpdatingId === item.id || item.status === "IN_PROGRESS"}
                  onClick={() => updateStatus(item.id, "IN_PROGRESS")}
                >
                  Marcar em andamento
                </Button>
                <Button
                  size="sm"
                  className="text-xs"
                  disabled={isUpdatingId === item.id || item.status === "COMPLETED"}
                  onClick={() => updateStatus(item.id, "COMPLETED")}
                >
                  Concluir
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={isUpdatingId === item.id || item.status === "REJECTED"}
                  onClick={() => updateStatus(item.id, "REJECTED")}
                >
                  Rejeitar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  disabled={isUpdatingId === item.id || item.status === "OPEN"}
                  onClick={() => updateStatus(item.id, "OPEN")}
                >
                  Reabrir
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
