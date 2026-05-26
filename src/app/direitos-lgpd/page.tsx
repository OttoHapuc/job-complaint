"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, ShieldCheck, Send } from "lucide-react"
import { Button } from "@/components/ui/button"

const REQUEST_TYPES = [
  { value: "ACCESS", label: "Acesso aos dados" },
  { value: "CORRECTION", label: "Correção de dados" },
  { value: "ANONYMIZATION", label: "Anonimização" },
  { value: "DELETION", label: "Eliminação" },
  { value: "PORTABILITY", label: "Portabilidade" },
  { value: "INFORMATION", label: "Informações sobre tratamento" },
]

export default function DataSubjectRightsPage() {
  const [tenantCode, setTenantCode] = useState("")
  const [requestType, setRequestType] = useState("ACCESS")
  const [requesterName, setRequesterName] = useState("")
  const [requesterEmail, setRequesterEmail] = useState("")
  const [requesterDocument, setRequesterDocument] = useState("")
  const [details, setDetails] = useState("")
  const [legalConsent, setLegalConsent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [successId, setSuccessId] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccessId("")

    if (!legalConsent) {
      setError("É necessário aceitar o tratamento mínimo para registrar a solicitação.")
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/privacy/data-subject-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantCode,
          requestType,
          requesterName,
          requesterEmail,
          requesterDocument,
          details,
          legalConsent,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error ?? "Não foi possível registrar sua solicitação.")
        return
      }

      setSuccessId(data.request?.id ?? "")
      setRequesterDocument("")
      setDetails("")
    } catch {
      setError("Falha de conexão ao enviar solicitação.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <Link href="/politica-de-privacidade" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Voltar para Política de Privacidade
        </Link>

        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Direitos do Titular (LGPD)
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Solicitação de Direitos sobre Dados Pessoais</h1>
          <p className="text-sm text-muted-foreground">
            Use este formulário para exercer seus direitos previstos na LGPD. Sua solicitação será encaminhada à organização responsável.
          </p>
        </header>

        <form onSubmit={submit} className="border border-border rounded-sm bg-card p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Código da empresa (opcional)</label>
              <input
                value={tenantCode}
                onChange={(e) => setTenantCode(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                placeholder="empresa-demo"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Tipo de solicitação</label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
              >
                {REQUEST_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <input
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
              placeholder="Nome completo"
              required
            />
            <input
              value={requesterEmail}
              onChange={(e) => setRequesterEmail(e.target.value)}
              className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
              placeholder="email@exemplo.com"
              type="email"
              required
            />
          </div>

          <input
            value={requesterDocument}
            onChange={(e) => setRequesterDocument(e.target.value)}
            className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
            placeholder="Documento (CPF) - opcional"
          />

          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm min-h-[110px]"
            placeholder="Descreva sua solicitação de forma objetiva."
            required
          />

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={legalConsent}
              onChange={(e) => setLegalConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Autorizo o tratamento mínimo dos dados informados para análise da solicitação LGPD.
            </span>
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {successId && (
            <p className="text-sm text-green-700 dark:text-green-400">
              Solicitação registrada com sucesso. Protocolo: <span className="font-mono">{successId}</span>
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={loading} className="gap-2">
              <Send className="h-4 w-4" />
              {loading ? "Enviando..." : "Enviar Solicitação"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
