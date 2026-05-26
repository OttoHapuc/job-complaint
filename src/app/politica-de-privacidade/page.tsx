import Link from "next/link"
import { ArrowLeft, Database, Lock, ShieldCheck } from "lucide-react"

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao início
        </Link>

        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Política de Privacidade
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Política de Privacidade da JobComplaint</h1>
          <p className="text-sm text-muted-foreground">
            Última atualização: {new Date().toLocaleDateString("pt-BR")}
          </p>
        </header>

        <section className="border border-border rounded-sm bg-card p-6 space-y-6 text-sm leading-relaxed">
          <div>
            <h2 className="font-semibold mb-2">1. Princípios de tratamento</h2>
            <p>
              Tratamos dados pessoais conforme princípios da finalidade, necessidade, segurança, transparência,
              prevenção e responsabilização, observando a LGPD e demais normas aplicáveis.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">2. Dados tratados</h2>
            <p>
              A plataforma prioriza anonimização e minimização. São tratados dados de relato, metadados de
              segurança e eventos de auditoria estritamente necessários à operação e conformidade.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">3. Base legal e papéis</h2>
            <p>
              A empresa cliente define finalidades e atua como controladora. A JobComplaint atua como operadora
              técnica, processando dados sob instrução da controladora.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">4. Segurança da informação</h2>
            <p>
              Adotamos controles de autenticação, segregação de tenant, trilha de auditoria imutável, monitoramento
              operacional e políticas de retenção/expurgo.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">5. Retenção e descarte</h2>
            <p>
              Dados são retidos pelo período necessário ao cumprimento da finalidade e obrigações legais, com
              possibilidade de anonimização/expurgo conforme política da organização e requisitos regulatórios.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">6. Direitos do titular</h2>
            <p>
              Direitos de acesso, correção, anonimização, eliminação e informação sobre tratamento podem ser
              solicitados à controladora ou ao canal formal de privacidade definido pela organização.
            </p>
            <p className="mt-2">
              Você pode registrar sua solicitação no portal de direitos:{" "}
              <Link href="/direitos-lgpd" className="underline underline-offset-2 hover:text-foreground">
                Direitos do Titular (LGPD)
              </Link>
              .
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">7. Incidentes de segurança</h2>
            <p>
              Incidentes relevantes serão tratados com resposta estruturada, registro técnico e comunicação
              conforme exigência legal e contratual.
            </p>
          </div>
        </section>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="border border-border rounded-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <Database className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Governança de dados</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Recomendado manter inventário de dados e ROPA atualizado por área de negócio.
            </p>
          </div>
          <Link href="/termos-de-uso" className="border border-border rounded-sm p-4 hover:bg-secondary/40 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Termos de Uso</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Regras de uso da plataforma, responsabilidades e limitações operacionais.
            </p>
          </Link>
          <Link href="/direitos-lgpd" className="border border-border rounded-sm p-4 hover:bg-secondary/40 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Direitos do Titular (LGPD)</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Canal para solicitar acesso, correção, anonimização, eliminação e portabilidade.
            </p>
          </Link>
        </div>
      </div>
    </div>
  )
}
