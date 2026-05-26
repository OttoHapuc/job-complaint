"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"

type InviteData = {
  role: string
  acceptedAt: string | null
  expiresAt: string
  questions: string[]
}

export default function InvitePage() {
  const params = useParams<{ token: string }>()
  const token = params?.token ?? ""
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [questionText, setQuestionText] = useState("")
  const [answerText, setAnswerText] = useState("")
  const [sending, setSending] = useState(false)
  const [responseOk, setResponseOk] = useState("")

  useEffect(() => {
    const load = async () => {
      if (!token) return
      setLoading(true)
      try {
        const response = await fetch(`/api/invites/${token}`, { cache: "no-store" })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          setError(data.error ?? "Convite inválido.")
          return
        }
        setInvite(data.invite ?? null)
        if (Array.isArray(data.invite?.questions) && data.invite.questions.length > 0) {
          setQuestionText(data.invite.questions[0])
        }
        setError("")
      } catch {
        setError("Falha de conexão ao carregar convite.")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [token])

  const acceptInvite = async () => {
    setError("")
    const response = await fetch(`/api/invites/${token}`, {
      method: "POST",
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error ?? "Não foi possível aceitar convite.")
      return
    }
    setInvite((prev) => (prev ? { ...prev, acceptedAt: new Date().toISOString() } : prev))
  }

  const submitResponse = async () => {
    if (!answerText.trim()) return
    setSending(true)
    setError("")
    setResponseOk("")
    try {
      const response = await fetch(`/api/invites/${token}/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText,
          answerText,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error ?? "Não foi possível enviar resposta.")
        return
      }
      setResponseOk("Resposta enviada com sucesso.")
      setAnswerText("")
    } catch {
      setError("Falha de conexão ao enviar resposta.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-2xl mx-auto border border-border rounded-sm bg-card p-6 space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Canal Individual de Investigação</h1>
        {loading && <p className="text-sm text-muted-foreground">Carregando convite...</p>}
        {!loading && error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!loading && invite && (
          <>
            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">Acesso:</span> Token individualizado</p>
              <p><span className="text-muted-foreground">Expira em:</span> {new Date(invite.expiresAt).toLocaleString("pt-BR")}</p>
            </div>

            {!invite.acceptedAt ? (
              <Button onClick={acceptInvite} className="text-xs">Aceitar convite</Button>
            ) : (
              <p className="text-xs text-green-700 dark:text-green-300">Convite aceito.</p>
            )}

            <div className="border border-border rounded-sm p-4 space-y-3">
              <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Responder perguntas
              </p>
              {invite.questions.length > 1 ? (
                <select
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-background"
                >
                  {invite.questions.map((question) => (
                    <option key={question} value={question}>
                      {question}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-background">
                  {questionText || "Pergunta indisponível no momento."}
                </div>
              )}
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Sua resposta"
                className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-background"
                rows={5}
              />
              <Button onClick={submitResponse} disabled={sending || !answerText.trim()} className="text-xs">
                {sending ? "Enviando..." : "Enviar resposta"}
              </Button>
              {responseOk && <p className="text-xs text-green-700 dark:text-green-300">{responseOk}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
