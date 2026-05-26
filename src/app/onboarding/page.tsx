"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Building2, Shield, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function OnboardingPage() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState("")
  const [companyCode, setCompanyCode] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [billingEmail, setBillingEmail] = useState("")
  const [estimatedEmployees, setEstimatedEmployees] = useState(100)
  const [corporateLoginEmail, setCorporateLoginEmail] = useState("")
  const [corporateLoginPassword, setCorporateLoginPassword] = useState("")
  const [professionalName, setProfessionalName] = useState("")
  const [professionalCompanyRole, setProfessionalCompanyRole] = useState("")
  const [professionalEmail, setProfessionalEmail] = useState("")
  const [professionalPassword, setProfessionalPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [acceptedLegal, setAcceptedLegal] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!acceptedLegal) {
      setError("Para criar a organização, é necessário aceitar os Termos e a Política de Privacidade.")
      return
    }
    setIsLoading(true)

    try {
      const response = await fetch("/api/saas/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyName,
          companyCode,
          websiteUrl,
          billingEmail,
          estimatedEmployees,
          corporateLoginEmail,
          corporateLoginPassword,
          professionalName,
          professionalCompanyRole,
          professionalEmail,
          professionalPassword,
          acceptedTerms: acceptedLegal,
          acceptedPrivacy: acceptedLegal,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.error ?? "Não foi possível concluir o onboarding.")
        return
      }

      router.push("/dashboard")
    } catch {
      setError("Falha de conexão durante o onboarding.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link href="/auth/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" />
          Voltar para login
        </Link>

        <div className="mb-8">
          <div className="inline-flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            Onboarding Self-Service
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Criar Organização no JobComplaint</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Configure sua empresa em minutos com plano inicial automático por volume de colaboradores.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-6 border border-border rounded-sm bg-card p-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Empresa</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                placeholder="Nome da empresa"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Código da Empresa</label>
              <input
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                placeholder="empresa-demo"
                required
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Website</label>
              <input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                placeholder="https://empresa.com.br"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">E-mail de Faturamento</label>
              <input
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                placeholder="financeiro@empresa.com.br"
                type="email"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Colaboradores estimados</label>
            <input
              value={estimatedEmployees}
              onChange={(e) => setEstimatedEmployees(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
              type="number"
              min={1}
            />
          </div>

          <div className="border-t border-border pt-5">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Login corporativo (configurações)</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <input
                value={corporateLoginEmail}
                onChange={(e) => setCorporateLoginEmail(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                placeholder="corporativo@empresa.com.br"
                type="email"
                required
              />
              <input
                value={corporateLoginPassword}
                onChange={(e) => setCorporateLoginPassword(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                placeholder="Senha corporativa (mín. 8 chars)"
                type="password"
                required
              />
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Primeiro integrante profissional (casos e resultados)</p>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <input
                value={professionalName}
                onChange={(e) => setProfessionalName(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                placeholder="Nome completo"
                required
              />
              <input
                value={professionalCompanyRole}
                onChange={(e) => setProfessionalCompanyRole(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                placeholder="Cargo na empresa (ex.: Analista de RH)"
                required
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <input
                value={professionalEmail}
                onChange={(e) => setProfessionalEmail(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                placeholder="profissional@empresa.com.br"
                type="email"
                required
              />
              <input
                value={professionalPassword}
                onChange={(e) => setProfessionalPassword(e.target.value)}
                className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                placeholder="Senha profissional (mín. 8 chars)"
                type="password"
                required
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={acceptedLegal}
              onChange={(e) => setAcceptedLegal(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Declaro que li e aceito os{" "}
              <Link href="/termos-de-uso" className="underline underline-offset-2 hover:text-foreground">
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link href="/politica-de-privacidade" className="underline underline-offset-2 hover:text-foreground">
                Política de Privacidade
              </Link>
              .
            </span>
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Tenant criado com isolamento e plano inicial automático.
            </div>
            <Button type="submit" disabled={isLoading} className="gap-2">
              <Building2 className="h-4 w-4" />
              {isLoading ? "Criando organização..." : "Concluir Onboarding"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
