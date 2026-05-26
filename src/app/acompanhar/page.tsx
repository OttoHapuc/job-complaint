"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import {
  Shield,
  ArrowLeft,
  Lock,
  CheckCircle,
  Clock,
  FileSearch,
  Users,
  MessageSquare,
  Send,
  Bot,
  User,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { WHISTLEBLOWER_LABELS } from "@/lib/whistleblower-labels"

type Stage = "token" | "panel"

type TimelineEvent = {
  id: string
  icon: typeof CheckCircle
  title: string
  description: string
  timestamp: string
  status: "done" | "active" | "pending"
}

type ChatMessage = {
  id: string
  role: "council" | "whistleblower" | "investigation_agent"
  authorLabel?: string
  content: string
  timestamp: string
}

const INITIAL_CHAT: ChatMessage[] = []

const FALLBACK_TIMELINE: TimelineEvent[] = [
  {
    id: "fallback-1",
    icon: CheckCircle,
    title: "Recebido",
    description: "Denúncia recebida e registrada no sistema.",
    timestamp: "Pendente",
    status: "active",
  },
]

function mapCaseStatusLabel(status?: string) {
  if (!status) return "Em análise"
  if (status === "RESOLVED") return "Conclusões"
  if (status === "AWAITING_COMMITTEE_APPROVAL") return "Pre-conclusões"
  if (status === "WAITING_RESPONSE") return "Etapa de investigação"
  if (status === "IN_REVIEW" || status === "ESCALATED" || status === "OPEN") return "Etapa de revisão"
  return "Em análise"
}

export default function AcompanharPage() {
  const [stage, setStage] = useState<Stage>("token")
  const [tokenInput, setTokenInput] = useState("")
  const [tokenError, setTokenError] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT)
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>(FALLBACK_TIMELINE)
  const [caseStatus, setCaseStatus] = useState("Em análise")
  const [caseId, setCaseId] = useState("CASO-XXXX")
  const [lastUpdate, setLastUpdate] = useState<string>("")
  const [chatInput, setChatInput] = useState("")
  const [isLoadingToken, setIsLoadingToken] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [canReply, setCanReply] = useState(true)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [interactionStatus, setInteractionStatus] = useState<string>("ANALYZING")
  const [interactionStatusLabel, setInteractionStatusLabel] = useState<string>("")
  const [nextContactAt, setNextContactAt] = useState<string | null>(null)
  const [processingSince, setProcessingSince] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  const getTimelineIcon = (title: string) => {
    const normalized = title.toLowerCase()
    if (normalized.includes("message")) return MessageSquare
    if (normalized.includes("review") || normalized.includes("análise")) return Users
    if (normalized.includes("report") || normalized.includes("submitted")) return FileSearch
    return CheckCircle
  }

  const loadTracking = async (cleanedToken: string) => {
    const response = await fetch("/api/tracking/lookup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: cleanedToken }),
    })

    if (!response.ok) {
      return { ok: false as const }
    }

    const data = await response.json()
    const mappedTimeline: TimelineEvent[] = (data.timeline ?? []).map(
      (event: { id: number; title: string; description: string; timestamp: string; stageStatus?: "done" | "active" | "pending" }, index: number, arr: unknown[]) => ({
        id: String(event.id),
        icon: getTimelineIcon(event.title),
        title: event.title,
        description: event.description,
        timestamp: event.timestamp,
        status: event.stageStatus ?? (index === arr.length - 1 ? "active" : "done"),
      }),
    )

    setTimelineEvents(mappedTimeline.length > 0 ? mappedTimeline : FALLBACK_TIMELINE)
    setChatMessages((data.messages ?? []) as ChatMessage[])
    setCaseStatus(mapCaseStatusLabel(data.case?.status))
    setCaseId(data.case?.id ?? "CASO-XXXX")
    setLastUpdate(
      data.case?.updatedAt
        ? new Date(data.case.updatedAt).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
    )
    setCanReply(Boolean(data.canReply))
    setPendingQuestion(typeof data.pendingQuestion === "string" ? data.pendingQuestion : null)
    setInteractionStatus(typeof data.interactionStatus === "string" ? data.interactionStatus : "ANALYZING")
    setInteractionStatusLabel(typeof data.interactionStatusLabel === "string" ? data.interactionStatusLabel : "")
    setNextContactAt(typeof data.nextContactAt === "string" ? data.nextContactAt : null)
    setProcessingSince(typeof data.processingSince === "string" ? data.processingSince : null)
    return { ok: true as const }
  }

  const handleTokenSubmit = async () => {
    const cleaned = tokenInput.trim().toUpperCase()
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleaned)) {
      setTokenError(true)
      return
    }

    setIsLoadingToken(true)
    try {
      const result = await loadTracking(cleaned)
      if (!result.ok) {
        setTokenError(true)
        return
      }
      setStage("panel")
      setTokenError(false)
    } catch {
      setTokenError(true)
    } finally {
      setIsLoadingToken(false)
    }
  }

  useEffect(() => {
    if (stage !== "panel") return
    const normalized = tokenInput.trim().toUpperCase()
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized)) return
    if (
      interactionStatus !== "PROCESSING_YOUR_MESSAGE" &&
      interactionStatus !== "ANALYZING" &&
      !nextContactAt
    ) {
      return
    }

    const timer = window.setInterval(() => {
      void loadTracking(normalized)
    }, 15000)

    return () => {
      window.clearInterval(timer)
    }
  }, [stage, tokenInput, interactionStatus, nextContactAt])

  const sendChat = async () => {
    if (!chatInput.trim()) return
    if (!canReply) return
    if (isSending) return
    setIsSending(true)

    try {
      const response = await fetch("/api/tracking/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: tokenInput,
          content: chatInput.trim(),
        }),
      })

      if (!response.ok) {
        return
      }

      const data = await response.json()
      const msg: ChatMessage = {
        id: data.message.id,
        role: "whistleblower",
        content: data.message.content,
        timestamp: new Date(data.message.timestamp).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      }
      setChatMessages((prev) => [...prev, msg])
      setChatInput("")
    } finally {
      setIsSending(false)
    }
  }

  if (stage === "token") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 text-sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>

          <div className="flex items-center gap-2 mb-8">
            <Shield className="h-5 w-5 text-foreground" />
            <span className="font-semibold tracking-tight text-sm">JobComplaint</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight mb-2">Portal do Denunciante</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            Insira o token criptográfico fornecido no momento da denúncia para acessar o painel de acompanhamento.
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                Token Criptográfico
              </label>
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => {
                  setTokenInput(e.target.value.toUpperCase())
                  setTokenError(false)
                }}
                onKeyDown={(e) => e.key === "Enter" && handleTokenSubmit()}
                placeholder="Ex: 4A9B-X72P-99QW"
                className={`w-full bg-background border rounded-sm px-4 py-3 text-sm font-mono tracking-widest placeholder:text-muted-foreground placeholder:tracking-normal focus:outline-none focus:ring-1 focus:ring-ring ${
                  tokenError ? "border-red-500" : "border-border"
                }`}
              />
              {tokenError && (
                <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Token inválido. Verifique o formato e tente novamente.
                </p>
              )}
            </div>

            <Button className="w-full gap-2" onClick={handleTokenSubmit}>
              <Lock className="h-4 w-4" />
              {isLoadingToken ? "Validando..." : "Acessar Painel Seguro"}
            </Button>
          </div>

          <div className="mt-8 border border-border rounded-sm bg-card p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Não possui um token?</strong> O token é gerado automaticamente ao finalizar uma denúncia. Se você perdeu o token, não é possível recuperá-lo por motivos de segurança.{" "}
              O prazo padrão de conclusão é de até 45 dias, com atualizações durante a investigação para quem acompanha com token.{" "}
              <Link href="/denunciar" className="underline underline-offset-2 hover:text-foreground">
                Fazer nova denúncia
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setStage("token")} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold">Painel de Acompanhamento</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="font-mono text-xs hidden sm:inline-flex">
              Token: {tokenInput.slice(0, 9)}...
            </Badge>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-muted-foreground font-mono hidden sm:block">Seguro</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 w-full">
        {/* Status banner */}
        <div className="flex items-center gap-3 bg-yellow-500/5 border border-yellow-500/20 rounded-sm px-4 py-3 mb-8">
          <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">{caseStatus}</p>
            <p className="text-xs text-yellow-700/70 dark:text-yellow-300/70">Última atualização: {lastUpdate || "—"}</p>
            {interactionStatusLabel && (
              <p className="text-xs text-yellow-700/70 dark:text-yellow-300/70 mt-1">
                {interactionStatusLabel}
              </p>
            )}
            {processingSince && interactionStatus === "PROCESSING_YOUR_MESSAGE" && (
              <p className="text-xs text-yellow-700/70 dark:text-yellow-300/70 mt-1">
                Em processamento desde: {new Date(processingSince).toLocaleString("pt-BR")}
              </p>
            )}
            {nextContactAt && (
              <p className="text-xs text-yellow-700/70 dark:text-yellow-300/70 mt-1">
                Próxima atualização prevista: {new Date(nextContactAt).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
          <Badge className="text-xs bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/30 shrink-0">
            Caso #{caseId}
          </Badge>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Timeline */}
          <div>
            <h2 className="text-sm font-semibold mb-5 uppercase tracking-widest text-muted-foreground font-mono">
              Trilha de Eventos
            </h2>
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

              <div className="space-y-0">
                {timelineEvents.map((event) => (
                  <div key={event.id} className="relative flex gap-4 pb-8 last:pb-0">
                    {/* Icon */}
                    <div
                      className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-sm border shrink-0 ${
                        event.status === "done"
                          ? "bg-foreground border-foreground text-background"
                          : event.status === "active"
                          ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-600 dark:text-yellow-400"
                          : "bg-background border-border text-muted-foreground"
                      }`}
                    >
                      <event.icon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className={`pt-0.5 ${event.status === "pending" ? "opacity-40" : ""}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold">{event.title}</p>
                        {event.status === "active" && (
                          <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-1">{event.description}</p>
                      <p className="text-xs font-mono text-muted-foreground/60">{event.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Anonymous Chat */}
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold mb-5 uppercase tracking-widest text-muted-foreground font-mono">
              {WHISTLEBLOWER_LABELS.investigationAgent.chatTitle}
            </h2>

            <div className="flex-1 border border-border rounded-sm bg-card overflow-hidden flex flex-col">
              {/* Chat notice */}
              <div className="px-4 py-2.5 bg-secondary border-b border-border">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  {WHISTLEBLOWER_LABELS.investigationAgent.anonymityNotice}
                </p>
                {pendingQuestion && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {WHISTLEBLOWER_LABELS.investigationAgent.pendingQuestionPrefix}: {pendingQuestion}
                  </p>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[280px] max-h-[360px]">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${msg.role === "whistleblower" ? "flex-row-reverse" : ""}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-sm border flex items-center justify-center shrink-0 mt-0.5 ${
                        msg.role !== "whistleblower"
                          ? "bg-foreground border-foreground text-background"
                          : "bg-secondary border-border"
                      }`}
                    >
                      {msg.role !== "whistleblower" ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                    </div>
                    <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === "whistleblower" ? "items-end" : ""}`}>
                      <span className="text-xs text-muted-foreground">
                        {msg.authorLabel || (msg.role === "whistleblower" ? "Você (Anônimo)" : WHISTLEBLOWER_LABELS.investigationAgent.name)}
                      </span>
                      <div
                        className={`rounded-sm px-3 py-2 text-xs leading-relaxed ${
                          msg.role !== "whistleblower"
                            ? "bg-background border border-border text-foreground"
                            : "bg-foreground text-background"
                        }`}
                      >
                        {msg.content}
                      </div>
                      <span className="text-xs font-mono text-muted-foreground/60">{msg.timestamp}</span>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border p-3 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  placeholder={
                    canReply
                      ? WHISTLEBLOWER_LABELS.investigationAgent.replyPlaceholder
                      : WHISTLEBLOWER_LABELS.investigationAgent.waitingPlaceholder
                  }
                  className="flex-1 bg-background border border-border rounded-sm px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  disabled={!canReply}
                />
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={sendChat}
                  disabled={!chatInput.trim() || isSending || !canReply}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
