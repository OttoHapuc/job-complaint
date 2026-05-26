"use client"

import Link from "next/link"
import { Shield, Lock, Eye, EyeOff, ChevronRight, AlertTriangle, FileText, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-foreground" />
            <span className="font-semibold tracking-tight text-sm">JobComplaint</span>
            <Badge variant="outline" className="text-xs font-mono ml-1 hidden sm:inline-flex">LGPD</Badge>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/termos-de-uso" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden md:block">
              Termos de Uso
            </Link>
            <Link href="/politica-de-privacidade" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden md:block">
              Privacidade
            </Link>
            <Link href="/direitos-lgpd" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden md:block">
              Direitos LGPD
            </Link>
            <Link href="/acompanhar" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
              Acompanhar Denúncia
            </Link>
            <Link href="/auth/login">
              <Button variant="outline" size="sm" className="text-xs">
                Acesso Corporativo
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border">
          <div className="max-w-6xl mx-auto px-6 py-24 md:py-36">
            <div className="max-w-3xl">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-6">
                Canal Seguro de Denúncias — Assistido por IA
              </p>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight text-balance mb-6">
                Integridade não é opcional.
                <br />
                <span className="text-muted-foreground">É o que nos define.</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-xl mb-10">
                Um ambiente de trabalho saudável começa com a coragem de falar. Nossa plataforma garante seu anonimato através de Inteligência Artificial, proteção de dados e conformidade total com a LGPD.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/denunciar">
                  <Button size="lg" className="w-full sm:w-auto gap-2 font-medium">
                    <Lock className="h-4 w-4" />
                    Fazer uma Denúncia Segura
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/acompanhar">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2 font-medium">
                    <Eye className="h-4 w-4" />
                    Acompanhar Denúncia Existente
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats bar */}
        <section className="border-b border-border bg-card">
          <div className="max-w-6xl mx-auto px-6 py-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { value: "100%", label: "Anônimo por padrão" },
                { value: "0", label: "Dados identificáveis retidos" },
                { value: "LGPD", label: "Conformidade garantida" },
                { value: "E2E", label: "Criptografia de ponta a ponta" },
              ].map((stat, i) => (
                <div key={stat.label} className={`${i > 0 ? "border-l border-border pl-6" : ""}`}>
                  <p className="text-2xl font-bold font-mono tracking-tight">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How AI protects you */}
        <section className="border-b border-border">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <div className="mb-12">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
                Tecnologia de Proteção
              </p>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-balance">
                Como a IA garante seu anonimato
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-px bg-border rounded-sm overflow-hidden">
              {[
                {
                  icon: EyeOff,
                  title: "Triagem Neutra",
                  description:
                    "Nossa IA processa o conteúdo da denúncia sem acesso a dados pessoais. O agente categoriza e avalia o risco sem saber quem você é.",
                  detail: "Processamento isolado e sem estado",
                },
                {
                  icon: FileText,
                  title: "Sanitização de Dados",
                  description:
                    "Antes de qualquer análise humana, a IA remove automaticamente nomes, setores, datas e qualquer padrão que possa identificá-lo.",
                  detail: "Remoção de metadados em todos os anexos",
                },
                {
                  icon: Lock,
                  title: "Criptografia E2E",
                  description:
                    "Sua denúncia é criptografada no seu dispositivo antes de ser transmitida. Nem a equipe técnica consegue acessar o conteúdo original.",
                  detail: "AES-256 com chaves descartáveis",
                },
              ].map((card) => (
                <div key={card.title} className="bg-card p-8 flex flex-col gap-4">
                  <div className="w-10 h-10 border border-border flex items-center justify-center rounded-sm">
                    <card.icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-2">{card.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground border-t border-border pt-4 mt-auto">
                    {card.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Process steps */}
        <section className="border-b border-border bg-card">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <div className="mb-12">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
                Processo
              </p>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-balance">
                O que acontece após a denúncia
              </h2>
            </div>
            <div className="grid md:grid-cols-4 gap-8">
              {[
                { step: "01", title: "Recepção pela IA", desc: "O agente recebe e processa sua denúncia de forma totalmente anônima." },
                { step: "02", title: "Sanitização", desc: "Dados identificáveis são removidos automaticamente pelo sistema." },
                { step: "03", title: "Análise do Conselho", desc: "O Conselho de Ética analisa o caso sem acesso à sua identidade." },
                { step: "04", title: "Resolução", desc: "Você acompanha o andamento via token criptográfico gerado no início." },
              ].map((item) => (
                <div key={item.step} className="flex flex-col gap-3">
                  <span className="text-xs font-mono text-muted-foreground">{item.step}</span>
                  <div className="h-px bg-border" />
                  <h3 className="font-semibold text-sm">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="border-b border-border">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <div className="mb-12">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
                Tipos de Denúncia
              </p>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-balance">
                Toda violação merece atenção
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Assédio Moral", level: "critical" },
                { label: "Assédio Sexual", level: "critical" },
                { label: "Fraude Financeira", level: "critical" },
                { label: "Discriminação", level: "warning" },
                { label: "Conflito de Interesses", level: "warning" },
                { label: "Violação de Dados", level: "warning" },
                { label: "Irregularidades Contratuais", level: "low" },
                { label: "Má Conduta Geral", level: "low" },
                { label: "Segurança do Trabalho", level: "low" },
              ].map((cat) => (
                <span
                  key={cat.label}
                  className={`inline-flex items-center px-3 py-1.5 text-xs font-medium border rounded-sm ${
                    cat.level === "critical"
                      ? "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5"
                      : cat.level === "warning"
                      ? "border-yellow-500/30 text-yellow-700 dark:text-yellow-400 bg-yellow-500/5"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {cat.level === "critical" && <AlertTriangle className="h-3 w-3 mr-1.5" />}
                  {cat.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Bottom */}
        <section className="bg-foreground text-background">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3 text-balance">
                  Pronto para agir com responsabilidade?
                </h2>
                <p className="text-sm opacity-60 leading-relaxed max-w-md">
                  Seu relato pode transformar o ambiente de trabalho. Você está protegido. A empresa está mais segura.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <Link href="/denunciar">
                  <Button size="lg" className="w-full sm:w-auto bg-background text-foreground hover:bg-background/90 gap-2 font-medium">
                    <Lock className="h-4 w-4" />
                    Fazer uma Denúncia Segura
                  </Button>
                </Link>
                <Link href="/acompanhar">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto border-background/30 text-background hover:bg-background/10 gap-2 font-medium">
                    <Eye className="h-4 w-4" />
                    Acompanhar Denúncia
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">JobComplaint</span>
          </div>
          <span className="text-xs text-muted-foreground">Em conformidade com a LGPD — Lei 13.709/2018</span>
          <div className="flex items-center gap-3">
            <Link href="/termos-de-uso" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Termos
            </Link>
            <Link href="/politica-de-privacidade" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Privacidade
            </Link>
            <Link href="/direitos-lgpd" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Direitos LGPD
            </Link>
            <Link href="/auth/login" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Users className="h-3 w-3" />
              Acesso Corporativo
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
