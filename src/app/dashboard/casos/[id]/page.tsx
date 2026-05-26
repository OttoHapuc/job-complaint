"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  FileText,
  History,
  MessageSquare,
  AlertTriangle,
  Hash,
  Lock,
  CheckCircle2,
  XCircle,
  GitMerge,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type Tab = "relatorio" | "auditoria" | "comunicacao" | "preconclusao"

type CaseDetail = {
  externalId: string
  title: string
  description: string
  category: string
  status: string
  risk: "Crítico" | "Médio" | "Baixo" | "Sigiloso"
  createdAt: string
  updatedAt: string
  investigationSummary?: {
    recommendedNextStep?: string
    confidence?: string
  } | null
  preConclusionPackage?: {
    recommendation?: string
    generatedAt?: string
  } | null
  reviewConcludedAt?: string | null
  readyForCommitteeAt?: string | null
}

type CaseMessage = {
  id: string
  authorLabel: string
  content: string
  createdAt: string
}

type AuditTrailItem = {
  id: string
  action: string
  actionDescription?: string
  actorLabel?: string
  createdAt: string
}

export default function CaseInvestigationPage() {
  const router = useRouter()
  const params = useParams()
  const caseId = String(params.id).toLowerCase()
  const [activeTab, setActiveTab] = useState<Tab>("relatorio")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [caseData, setCaseData] = useState<CaseDetail | null>(null)
  const [messages, setMessages] = useState<CaseMessage[]>([])
  const [auditTrail, setAuditTrail] = useState<AuditTrailItem[]>([])
  const [access, setAccess] = useState<{
    lockedByInitialAnalysis: boolean
    canViewAiReport: boolean
    canViewCommunication: boolean
    lockReason: string | null
  } | null>(null)
  const [committeeCanVote, setCommitteeCanVote] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [participantsCount, setParticipantsCount] = useState(0)
  const [actionError, setActionError] = useState("")
  const [preConclusion, setPreConclusion] = useState<{
    implicatedPeople: Array<{
      id: string
      visibleName: string
      roleHint: string | null
      disclosureLevel: string
    }>
  } | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch(`/api/dashboard/cases/${caseId}`, {
          cache: "no-store",
        })
        if (response.status === 401) {
          router.push("/auth/login")
          return
        }
        const data = await response.json().catch(() => ({}))
        if (!active) return
        if (!response.ok) {
          setError(data.error ?? "Não foi possível carregar os dados do caso.")
          return
        }
        setCaseData(data.case ?? null)
        setMessages(data.messages ?? [])
        setAuditTrail(data.auditTrail ?? [])
        setAccess(data.access ?? null)
        if (data.access?.lockedByInitialAnalysis) {
          setActiveTab("auditoria")
        }
        setCommitteeCanVote(Boolean(data.committee?.canVote))
        setParticipantsCount((data.participants ?? []).length)
        setPreConclusion(data.preConclusion ?? null)
        setError("")
      } catch {
        if (active) {
          setError("Falha de conexão ao carregar o caso.")
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [caseId, router])

  const TABS: { id: Tab; label: string; icon: typeof FileText; disabled?: boolean }[] = [
    { id: "relatorio", label: "Relatório da IA", icon: FileText, disabled: access ? !access.canViewAiReport : false },
    { id: "preconclusao", label: "Pre-conclusão", icon: GitMerge, disabled: access ? !access.canViewAiReport : false },
    { id: "auditoria", label: "Trilha de Auditoria", icon: History },
    { id: "comunicacao", label: "Comunicação", icon: MessageSquare, disabled: access ? !access.canViewCommunication : false },
  ]

  const updateWorkflow = async (status: "IN_REVIEW" | "WAITING_RESPONSE" | "AWAITING_COMMITTEE_APPROVAL") => {
    setActionLoading(true)
    setActionError("")
    try {
      const response = await fetch(`/api/dashboard/cases/${caseId}/workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setActionError(body.error ?? "Falha ao atualizar fluxo do caso.")
        return
      }
      router.refresh()
      window.location.reload()
    } catch {
      setActionError("Falha de conexão ao atualizar fluxo do caso.")
    } finally {
      setActionLoading(false)
    }
  }

  const voteCommittee = async (decision: "APPROVE" | "REJECT") => {
    setActionLoading(true)
    setActionError("")
    try {
      const response = await fetch(`/api/dashboard/cases/${caseId}/committee/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setActionError(body.error ?? "Falha ao registrar voto.")
        return
      }
      router.refresh()
      window.location.reload()
    } catch {
      setActionError("Falha de conexão ao registrar voto.")
    } finally {
      setActionLoading(false)
    }
  }

  const publishPreConclusion = async () => {
    setActionLoading(true)
    setActionError("")
    try {
      const response = await fetch(`/api/dashboard/cases/${caseId}/pre-conclusion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishToCommittee: true, disclosureMode: "PSEUDONYM" }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setActionError(body.error ?? "Falha ao publicar pre-conclusão.")
        return
      }
      router.refresh()
      window.location.reload()
    } catch {
      setActionError("Falha de conexão ao publicar pre-conclusão.")
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="px-6 py-8 space-y-6">
      {isLoading && <p className="text-sm text-muted-foreground">Carregando caso...</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!isLoading && !error && !caseData && <p className="text-sm text-muted-foreground">Caso não encontrado.</p>}

      {/* Case header */}
      {caseData && <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-sm font-bold">{caseData.externalId}</span>
            <Badge variant={caseData.risk === "Crítico" ? "destructive" : "secondary"} className="text-xs">
              {caseData.risk}
            </Badge>
            <Badge variant="outline" className="text-xs">{caseData.status}</Badge>
          </div>
          <h1 className="text-xl font-bold tracking-tight">{caseData.category}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recebido em {new Date(caseData.createdAt).toLocaleString("pt-BR")} · Última atualização:{" "}
            {new Date(caseData.updatedAt).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            disabled={actionLoading || Boolean(access?.lockedByInitialAnalysis)}
            onClick={() => updateWorkflow("IN_REVIEW")}
          >
            Em investigação
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            disabled={actionLoading || Boolean(access?.lockedByInitialAnalysis)}
            onClick={() => updateWorkflow("WAITING_RESPONSE")}
          >
            Aguardar resposta
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            disabled={actionLoading || Boolean(access?.lockedByInitialAnalysis)}
            onClick={publishPreConclusion}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
            Publicar pre-conclusão
          </Button>
          {committeeCanVote && caseData.status === "Aguardando Comitê" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 border-green-500/40"
                disabled={actionLoading || Boolean(access?.lockedByInitialAnalysis)}
                onClick={() => voteCommittee("APPROVE")}
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                Aprovar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 border-red-500/40"
                disabled={actionLoading || Boolean(access?.lockedByInitialAnalysis)}
                onClick={() => voteCommittee("REJECT")}
              >
                <XCircle className="h-3.5 w-3.5 text-red-600" />
                Rejeitar
              </Button>
            </>
          )}
        </div>
      </div>}
      {actionError && <p className="text-xs text-red-600 dark:text-red-400">{actionError}</p>}
      {access?.lockedByInitialAnalysis && access.lockReason && (
        <div className="border border-yellow-500/30 bg-yellow-500/5 rounded-sm px-4 py-3 text-xs text-yellow-800 dark:text-yellow-200">
          {access.lockReason}
        </div>
      )}

      {/* Tabs */}
      {caseData && <div className="border-b border-border">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              disabled={tab.disabled}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              } ${tab.disabled ? "opacity-50 cursor-not-allowed hover:text-muted-foreground" : ""}`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>}

      {/* Tab: Relatório da IA */}
      {caseData && activeTab === "relatorio" && (!access || access.canViewAiReport) && (
        <div className="border border-border rounded-sm bg-card p-6">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">Relato Sanitizado</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{caseData.description}</p>
          <div className="mt-4 text-xs text-muted-foreground space-y-1">
            <p>Participantes externos convidados: {participantsCount}</p>
            {caseData.investigationSummary?.recommendedNextStep ? (
              <p>Próximo passo sugerido pela IA: {caseData.investigationSummary.recommendedNextStep}</p>
            ) : null}
          </div>
        </div>
      )}

      {caseData && activeTab === "preconclusao" && (!access || access.canViewAiReport) && (
        <div className="border border-border rounded-sm bg-card p-6 space-y-4">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Pacote de Pre-conclusão</p>
          {caseData.preConclusionPackage ? (
            <>
              <p className="text-sm leading-relaxed">
                {(caseData.preConclusionPackage.recommendation as string) ||
                  "Pacote gerado com recomendações para decisão do comitê."}
              </p>
              <div className="text-xs text-muted-foreground">
                <p>Revisão concluída em: {caseData.reviewConcludedAt ? new Date(caseData.reviewConcludedAt).toLocaleString("pt-BR") : "—"}</p>
                <p>Pronto para comitê em: {caseData.readyForCommitteeAt ? new Date(caseData.readyForCommitteeAt).toLocaleString("pt-BR") : "—"}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Pessoas implicadas (disclosure)
                </p>
                {(preConclusion?.implicatedPeople ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma pessoa implicada registrada.</p>
                ) : (
                  <div className="space-y-2">
                    {(preConclusion?.implicatedPeople ?? []).map((person) => (
                      <div key={person.id} className="border border-border rounded-sm p-3 text-sm">
                        <p className="font-medium">{person.visibleName}</p>
                        <p className="text-xs text-muted-foreground">
                          {person.roleHint || "Sem papel declarado"} · {person.disclosureLevel}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pacote ainda não gerado. A revisão precisa estar concluída para publicação.
            </p>
          )}
        </div>
      )}

      {/* Tab: Trilha de Auditoria */}
      {caseData && activeTab === "auditoria" && (
        <div className="max-w-2xl space-y-4">
          <div className="border border-border rounded-sm bg-card overflow-hidden">
            <div className="px-5 py-3 bg-secondary border-b border-border">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                Registros Imutáveis de Acesso
              </p>
            </div>
            <div className="divide-y divide-border">
              {auditTrail.map((event) => (
                <div key={event.id} className="flex gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="text-sm font-medium text-foreground">
                        {event.actionDescription ?? event.action.replaceAll("_", " ")}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground shrink-0">
                        {new Date(event.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ator: {event.actorLabel ?? "Sistema"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            Esta trilha é imutável e não pode ser editada ou excluída por nenhum usuário.
          </p>
        </div>
      )}

      {/* Tab: Comunicação */}
      {caseData && activeTab === "comunicacao" && (!access || access.canViewCommunication) && (
        <div className="max-w-3xl space-y-4">
          <div className="border border-border rounded-sm bg-card overflow-hidden">
            <div className="px-5 py-3 bg-secondary border-b border-border">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Histórico de Comunicações</p>
            </div>
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {messages.map((msg) => (
                <div key={msg.id} className="px-5 py-4 flex gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-semibold text-foreground">{msg.authorLabel}</p>
                      <span className="text-xs font-mono text-muted-foreground ml-auto">
                        {new Date(msg.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
