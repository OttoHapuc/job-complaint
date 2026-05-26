"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import {
  Shield,
  Bot,
  User,
  Paperclip,
  Send,
  CheckCircle,
  Copy,
  Check,
  Lock,
  AlertTriangle,
  X,
  ArrowLeft,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type Message = {
  id: number
  role: "ai" | "user"
  content: string
  timestamp: string
}

type Stage = "chat" | "success"
type TenantMember = {
  id: string
  name: string
  companyRole: string
}

type CategoryOpinion =
  | ""
  | "Assédio Moral"
  | "Assédio Sexual"
  | "Discriminação"
  | "Retaliação"
  | "Conflito de Interesses"
  | "Fraude ou Corrupção"
  | "Violação de Política Interna"
  | "Privacidade e Dados"
  | "Segurança no Trabalho"
  | "Abuso de Autoridade"
  | "Outro"

const CATEGORY_OPTIONS: CategoryOpinion[] = [
  "",
  "Assédio Moral",
  "Assédio Sexual",
  "Discriminação",
  "Retaliação",
  "Conflito de Interesses",
  "Fraude ou Corrupção",
  "Violação de Política Interna",
  "Privacidade e Dados",
  "Segurança no Trabalho",
  "Abuso de Autoridade",
  "Outro",
]

const AI_RESPONSES: Record<number, string> = {
  1: "Obrigado. Agora informe pessoas envolvidas/corroboradoras no formato: Nome | WhatsApp ou E-mail.\n\nEsses contatos serão protegidos e usados somente para investigação formal.",
  2: "Perfeito. Antes de iniciar o detalhamento do caso, informar seu contato é opcional (WhatsApp ou e-mail) para notificações de andamento e resumo final.\n\nSeu contato não será exibido nem compartilhado com envolvidos internos ou externos, expresso para notificação.",
  3: "Ótimo. Agora vamos iniciar o caso: descreva a situação com o máximo de detalhes (contexto, frequência, impacto e área envolvida).",
  4: "Para apoiar a análise, em qual categoria você acredita que o caso melhor se enquadra?\n\n• Assédio Moral\n• Assédio Sexual\n• Fraude ou Corrupção\n• Discriminação\n• Conflito de Interesses\n• Outro",
  5: "Entendido. A situação é recorrente ou isolada? Se houver, inclua datas aproximadas e consequências práticas.",
  6: "Você possui evidências para anexar (documentos, prints, e-mails)? Se sim, os anexos serão processados com proteção e trilha técnica.\n\nQuando estiver pronto(a), finalize para gerar o token.",
}
const FLOW_TOTAL_STEPS = 7
const FINALIZATION_INFO_MESSAGE =
  "Recebi suas informações finais.\n\nSua denúncia será registrada com proteção, trilha de auditoria e tratamento sigiloso. Em seguida, você receberá um token único para acompanhamento.\n\nPróximos passos:\n• o caso entra em processo de análise inicial;\n• caso necessário uma investigação será iniciada;\n• o conselho acompanha a conclusão ou o risco sem exposição indevida de conteúdo;\n• você poderá acompanhar a evolução usando o token.\n\nQuando se sentir seguro(a), clique em “Finalizar denúncia e gerar token”."
const FLOW_STEP_LABELS = [
  "Bloqueio de membros",
  "Pessoas envolvidas",
  "Contato da denunciante",
  "Detalhamento inicial",
  "Categoria do caso",
  "Recorrência e impacto",
  "Evidências e finalização",
]

function formatTime() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

async function buildTextPreview(file: File) {
  if (file.type.startsWith("text/") || file.type.includes("json") || file.type.includes("csv")) {
    const text = await file.text()
    return text.slice(0, 1500)
  }
  return ""
}

function buildInitialAgentPrompt(tenantName: string, members: TenantMember[]): Message {
  const memberList = members.length
    ? members.map((member) => `• ${member.name} (${member.companyRole})`).join("\n")
    : "• Nenhum membro ativo encontrado no momento."

  return {
    id: Date.now(),
    role: "ai",
    content:
      `Empresa validada: ${tenantName}.\n\n` +
      `Antes de iniciar o caso, indique quem deve ser bloqueado por conflito de interesse.\n` +
      `Use o formato:\n` +
      `   BLOQUEAR: Nome Sobrenome, Outro Nome.\n\n` +
      `Membros ativos do conselho:\n${memberList}\n\n` +
      `A informação de bloqueio é sigilosa e protegida pelo processo de investigação.`,
    timestamp: "agora",
  }
}

function extractStructuredSignals(messages: Message[], members: TenantMember[]) {
  const userContents = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
  const joinedLower = userContents.join("\n").toLowerCase()

  const whistleblowerCategoryOpinion =
    CATEGORY_OPTIONS.find((category) => category && joinedLower.includes(category.toLowerCase())) || ""

  const corroborators = userContents
    .flatMap((content) => content.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, contact] = line.split("|").map((part) => part?.trim() || "")
      return { name, contact }
    })
    .filter((item) => item.name && item.contact)

  const emailMatch = joinedLower.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0] || ""
  const phoneMatch =
    joinedLower.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})-?\d{4}/)?.[0] || ""
  const whistleblowerContact = emailMatch || phoneMatch

  const explicitBlockLine = userContents.find((content) => /bloquear\s*:/i.test(content)) || ""
  const explicitBlockedNames = explicitBlockLine
    .replace(/.*bloquear\s*:/i, "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)

  const blockedMemberIds = members
    .filter((member) => {
      const name = member.name.toLowerCase()
      if (explicitBlockedNames.some((blockedName) => blockedName.includes(name) || name.includes(blockedName))) {
        return true
      }
      return userContents.some((content) => {
        const lower = content.toLowerCase()
        return lower.includes(name) && /(bloque|conflito|não pode|nao pode|impedir|restri)/.test(lower)
      })
    })
    .map((member) => member.id)

  return {
    whistleblowerCategoryOpinion,
    corroborators,
    whistleblowerContact,
    blockedMemberIds,
  }
}

export default function DenunciarPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [stage, setStage] = useState<Stage>("chat")
  const [aiStep, setAiStep] = useState(0)
  const [isTyping, setIsTyping] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])
  const [generatedToken, setGeneratedToken] = useState("")
  const [generatedCaseId, setGeneratedCaseId] = useState("")
  const [copied, setCopied] = useState(false)
  const [canFinish, setCanFinish] = useState(false)
  const [acceptedLegal, setAcceptedLegal] = useState(false)
  const [tenantCode, setTenantCode] = useState("")
  const [tenantName, setTenantName] = useState("")
  const [tenantLookupError, setTenantLookupError] = useState("")
  const [tenantLookupLoading, setTenantLookupLoading] = useState(false)
  const [availableMembers, setAvailableMembers] = useState<TenantMember[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [legalModal, setLegalModal] = useState<null | "terms" | "privacy">(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentFlowStep = Math.min(aiStep + 1, FLOW_TOTAL_STEPS)
  const flowProgressPercent = Math.round((currentFlowStep / FLOW_TOTAL_STEPS) * 100)
  const currentFlowLabel = FLOW_STEP_LABELS[currentFlowStep - 1] ?? FLOW_STEP_LABELS[0]
  const legalModalTitle = legalModal === "terms" ? "Termos de Uso" : "Política de Privacidade"
  const legalModalSrc = legalModal === "terms" ? "/termos-de-uso" : "/politica-de-privacidade"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  useEffect(() => {
    if (!legalModal) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLegalModal(null)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [legalModal])

  const lookupTenant = async () => {
    if (!tenantCode.trim()) return
    setTenantLookupLoading(true)
    setTenantLookupError("")
    try {
      const response = await fetch(`/api/public/tenant-lookup?code=${encodeURIComponent(tenantCode.trim().toLowerCase())}`, {
        cache: "no-store",
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setTenantLookupError(data.error ?? "Não foi possível consultar empresa.")
        setTenantName("")
        setAvailableMembers([])
        return
      }
      setTenantName(data.tenant?.name ?? "")
      const members = (data.activeMembers ?? []) as TenantMember[]
      setAvailableMembers(members)
      setTenantLookupError("")
      setAiStep(0)
      setCanFinish(false)
      setSubmitError("")
      setMessages([buildInitialAgentPrompt(data.tenant?.name ?? "Tenant identificado", members)])
    } catch {
      setTenantLookupError("Falha de conexão na consulta do código da empresa.")
    } finally {
      setTenantLookupLoading(false)
    }
  }

  const sendMessage = () => {
    if (!input.trim()) return
    if (!tenantName) return

    const userMsg: Message = {
      id: messages.length + 1,
      role: "user",
      content: input.trim(),
      timestamp: formatTime(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsTyping(true)

    const nextStep = aiStep + 1

    setTimeout(() => {
      setIsTyping(false)
      const aiContent = AI_RESPONSES[nextStep] ?? FINALIZATION_INFO_MESSAGE
      const aiMsg: Message = {
        id: messages.length + 2,
        role: "ai",
        content: aiContent,
        timestamp: formatTime(),
      }
      setMessages((prev) => [...prev, aiMsg])
      setAiStep(nextStep)
      if (nextStep >= 6) setCanFinish(true)
    }, 1500)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    setAttachments((prev) => [...prev, ...files])
  }

  const copyToken = () => {
    if (!generatedToken) return
    navigator.clipboard.writeText(generatedToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const submitReport = async () => {
    if (isSubmitting) return
    if (!acceptedLegal) {
      setSubmitError("Você precisa aceitar os Termos de Uso e a Política de Privacidade para prosseguir.")
      return
    }
    if (!tenantCode.trim()) {
      setSubmitError("Informe o código da empresa para registrar a denúncia no tenant correto.")
      return
    }
    if (!tenantName) {
      setSubmitError("Valide primeiro o código da empresa para carregar os membros ativos.")
      return
    }
    setSubmitError("")
    setIsSubmitting(true)

    try {
      const userNarrative = messages
        .filter((message) => message.role === "user")
        .map((message) => message.content)
        .join("\n\n")
      const extracted = extractStructuredSignals(messages, availableMembers)
      const attachmentsPayload = await Promise.all(
        attachments.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          base64Data: file.size <= 5 * 1024 * 1024 ? await fileToBase64(file) : "",
          textPreview: await buildTextPreview(file),
        })),
      )

      const response = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          narrative: userNarrative,
          conversation: messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          attachments: attachmentsPayload,
          tenantCode: tenantCode.trim().toLowerCase(),
          blockedMemberIds: extracted.blockedMemberIds,
          corroborators: extracted.corroborators,
          whistleblowerContact: extracted.whistleblowerContact,
          whistleblowerCategoryOpinion: extracted.whistleblowerCategoryOpinion,
          acceptedTerms: acceptedLegal,
          acceptedPrivacy: acceptedLegal,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setSubmitError(data.error ?? "Não foi possível registrar sua denúncia.")
        return
      }

      const data = await response.json()
      setGeneratedToken(data.token)
      setGeneratedCaseId(data.caseId)
      setStage("success")
    } catch {
      setSubmitError("Falha de conexão ao registrar denúncia.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (stage === "success") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 border border-green-500/30 mb-6 mx-auto">
            <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-center mb-2 tracking-tight">Denúncia Recebida</h1>
          <p className="text-sm text-muted-foreground text-center mb-8 leading-relaxed">
            Sua denúncia foi registrada e classificada para análise do Conselho de Ética. Guarde o token abaixo: ele é obrigatório para acompanhar o caso.
          </p>

          <div className="border border-border rounded-sm bg-card p-6 mb-6">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
              Token Criptográfico
            </p>
            <div className="flex items-center justify-between gap-4 bg-secondary rounded-sm px-4 py-3 mb-4">
              <span className="text-xl font-mono font-bold tracking-widest text-foreground">{generatedToken}</span>
              <Button variant="ghost" size="sm" onClick={copyToken} className="gap-1.5 shrink-0">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <div className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-sm p-3">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-700 dark:text-yellow-300 leading-relaxed">
                <strong>Atenção:</strong> este token não é recuperável. Sem ele, não será possível acompanhar ou complementar sua denúncia. O prazo de conclusão é de até 45 dias e seu acompanhamento ativo é essencial para diálogo com investigadores.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Link href="/acompanhar">
              <Button variant="outline" className="w-full gap-2 text-sm">
                Acompanhar Caso
              </Button>
            </Link>
            <Link href="/">
              <Button className="w-full gap-2 text-sm">
                Voltar ao Início
              </Button>
            </Link>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Caso ID gerado: <span className="font-mono">#{generatedCaseId}</span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold">Canal de Denúncias</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-muted-foreground font-mono">Conexão Segura</span>
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      </header>

      {/* Security notice */}
      <div className="bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            Esta conversa é <strong>anônima</strong> e <strong>criptografada</strong>. Nenhuma informação de sessão é armazenada. Em conformidade com a LGPD.
          </p>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <div className="max-w-sm">
            <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              Código da empresa (obrigatório)
            </label>
            <div className="mt-1 flex gap-2">
              <input
                value={tenantCode}
                onChange={(e) => setTenantCode(e.target.value)}
                placeholder="ex: acme"
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-xs"
              />
              <Button size="sm" variant="outline" className="text-xs" onClick={lookupTenant} disabled={tenantLookupLoading}>
                {tenantLookupLoading ? "..." : "Buscar"}
              </Button>
            </div>
            {tenantName && <p className="text-[11px] mt-1 text-green-700 dark:text-green-300">Empresa: {tenantName}</p>}
            {tenantLookupError && <p className="text-[11px] mt-1 text-red-600 dark:text-red-400">{tenantLookupError}</p>}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {tenantName && (
            <div className="border border-border rounded-sm bg-card p-3">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-mono uppercase tracking-widest text-muted-foreground">
                  Progresso do atendimento
                </span>
                <span className="text-muted-foreground">
                  Etapa {currentFlowStep} de {FLOW_TOTAL_STEPS}
                </span>
              </div>
              <p className="text-xs text-foreground mb-2">{currentFlowLabel}</p>
              <div className="h-1.5 bg-secondary rounded-sm overflow-hidden">
                <div
                  className="h-full bg-foreground transition-all duration-300"
                  style={{ width: `${flowProgressPercent}%` }}
                />
              </div>
            </div>
          )}
          {!tenantName && (
            <div className="border border-border rounded-sm bg-card p-4">
              <p className="text-sm text-muted-foreground">
                Informe e valide o código da empresa para iniciar o diálogo guiado com o Agente de Triagem.
              </p>
            </div>
          )}
          {tenantName && messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-sm border flex items-center justify-center shrink-0 mt-0.5 ${
                  msg.role === "ai"
                    ? "bg-foreground border-foreground text-background"
                    : "bg-secondary border-border text-foreground"
                }`}
              >
                {msg.role === "ai" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>

              {/* Bubble */}
              <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {msg.role === "ai" ? "Agente de Triagem IA" : "Você (Anônimo)"}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{msg.timestamp}</span>
                </div>
                <div
                  className={`rounded-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "ai"
                      ? "bg-card border border-border text-foreground"
                      : "bg-foreground text-background"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {tenantName && isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-sm border bg-foreground border-foreground text-background flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex flex-col gap-1 items-start">
                <span className="text-xs font-medium text-muted-foreground mb-0.5">Agente de Triagem IA</span>
                <div className="bg-card border border-border rounded-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-card sticky bottom-0">
        <div className="max-w-3xl mx-auto px-4 py-4">
          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {attachments.map((file, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-secondary border border-border rounded-sm px-2 py-1">
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]">{file.name}</span>
                  <Badge variant="outline" className="text-[10px] font-mono px-1 py-0">metadados removidos</Badge>
                  <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder={tenantName ? "Responda ao agente... (Shift+Enter para nova linha)" : "Valide o código da empresa para iniciar"}
                rows={3}
                className="w-full resize-none bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring leading-relaxed"
                disabled={!tenantName}
              />
            </div>
            <div className="flex flex-col gap-2 pb-0.5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFile}
                accept="image/*,.pdf,.doc,.docx"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => fileInputRef.current?.click()}
                title="Anexar arquivo (metadados serão removidos)"
                disabled={!tenantName}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                className="h-9 w-9"
                onClick={sendMessage}
                disabled={!tenantName || !input.trim() || isTyping}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-muted-foreground">
              Metadados de arquivos removidos automaticamente pela IA
            </p>
            {canFinish && (
              <Button
                size="sm"
                onClick={submitReport}
                className="gap-2 text-xs"
                disabled={isSubmitting}
              >
                <CheckCircle className="h-3.5 w-3.5" />
                {isSubmitting ? "Finalizando com segurança..." : "Finalizar denúncia e gerar token"}
              </Button>
            )}
          </div>
          <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={acceptedLegal}
              onChange={(e) => setAcceptedLegal(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Li e concordo com os{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setLegalModal("terms")}
              >
                Termos de Uso
              </button>{" "}
              e com a{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => setLegalModal("privacy")}
              >
                Política de Privacidade
              </button>
              .
            </span>
          </label>
          {submitError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{submitError}</p>}
        </div>
      </div>
      {legalModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setLegalModal(null)}
        >
          <div
            className="w-full max-w-4xl h-[85vh] bg-card border border-border rounded-sm overflow-hidden shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="h-12 px-4 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold">{legalModalTitle}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setLegalModal(null)}
                aria-label="Fechar modal legal"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <iframe
              title={legalModalTitle}
              src={legalModalSrc}
              className="w-full h-[calc(85vh-48px)] bg-background"
            />
          </div>
        </div>
      )}
    </div>
  )
}
