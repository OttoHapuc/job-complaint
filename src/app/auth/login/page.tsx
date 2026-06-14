"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Shield, Eye, EyeOff, ArrowLeft, Building2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function LoginPage() {
  const router = useRouter()
  const [nextPath] = useState(() => {
    if (typeof window === "undefined") {
      return "/dashboard"
    }
    return new URLSearchParams(window.location.search).get("next") || "/dashboard"
  })
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!email || !password) {
      setError("Preencha todos os campos.")
      return
    }
    setIsLoading(true)
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error ?? "Falha ao autenticar.")
        return
      }

      router.push(data.mustChangePassword ? "/dashboard/alterar-senha" : nextPath)
    } catch {
      setError("Não foi possível conectar ao servidor.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSSO = () => {
    setError("SSO corporativo será habilitado nas próximas fases do MVP.")
  }

  return (
    <div className="min-h-screen bg-background grid lg:grid-cols-2">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between bg-foreground text-background p-12">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <span className="font-semibold tracking-tight">JobComplaint</span>
        </div>

        <div className="max-w-sm">
          <p className="text-xs font-mono uppercase tracking-widest opacity-40 mb-6">
            Acesso Corporativo
          </p>
          <h2 className="text-3xl font-bold tracking-tight leading-tight mb-4 text-balance">
            Painel de Governança e Ética Corporativa
          </h2>
          <p className="text-sm opacity-60 leading-relaxed">
            Exclusivo para Gestores, RH e membros do Conselho de Ética. Acesso monitorado e registrado em trilha de auditoria.
          </p>
        </div>

        <div className="space-y-3">
          {[
            { label: "Gestores e Diretores", desc: "Visão executiva de casos e métricas" },
            { label: "Recursos Humanos", desc: "Gestão de investigações ativas" },
            { label: "Conselho de Ética", desc: "Análise e resolução de denúncias" },
          ].map((role) => (
            <div key={role.label} className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-background/40 shrink-0" />
              <div>
                <p className="text-xs font-semibold">{role.label}</p>
                <p className="text-xs opacity-40">{role.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-10 text-sm">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao início
          </Link>

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <Shield className="h-5 w-5 text-foreground" />
            <span className="font-semibold tracking-tight text-sm">JobComplaint</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight mb-1">Entrar</h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            Use o login corporativo (configurações) ou login profissional (casos e resultados).
          </p>

          {/* SSO Button */}
          <Button
            variant="outline"
            className="w-full mb-6 gap-2 font-medium"
            onClick={handleSSO}
            disabled={isLoading}
          >
            <Building2 className="h-4 w-4" />
            Entrar com SSO Corporativo
          </Button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-xs text-muted-foreground">ou com e-mail e senha</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                E-mail Corporativo
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@empresa.com.br"
                className="w-full bg-background border border-border rounded-sm px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Senha
                </label>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-background border border-border rounded-sm px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}

            <Button type="submit" className="w-full gap-2 font-medium" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Autenticando...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Entrar
                </>
              )}
            </Button>
          </form>

          <div className="mt-8 border border-border rounded-sm bg-card p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Acesso monitorado.</strong> Todos os logins, visualizações de casos e ações são registrados em trilha de auditoria imutável, conforme exigido pela LGPD e políticas de governança corporativa.
            </p>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Ao acessar, você declara ciência dos{" "}
            <Link href="/termos-de-uso" className="underline underline-offset-2 hover:text-foreground">
              Termos de Uso
            </Link>{" "}
            e da{" "}
            <Link href="/politica-de-privacidade" className="underline underline-offset-2 hover:text-foreground">
              Política de Privacidade
            </Link>
            .
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Ainda não possui organização?{" "}
            <Link href="/onboarding" className="underline underline-offset-2 hover:text-foreground">
              Iniciar onboarding self-service
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
