import Link from "next/link"
import { ArrowLeft, FileText, Scale, ShieldAlert } from "lucide-react"

export default function TermsOfUsePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao início
        </Link>

        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            Termos de Uso e Condições
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Termos de Uso da Plataforma JobComplaint</h1>
          <p className="text-sm text-muted-foreground">
            Última atualização: {new Date().toLocaleDateString("pt-BR")}
          </p>
        </header>

        <section className="border border-border rounded-sm bg-card p-6 space-y-6 text-sm leading-relaxed">
          <div>
            <h2 className="font-semibold mb-2">1. Objeto</h2>
            <p>
              Estes termos regulam o uso da plataforma JobComplaint, destinada ao registro, acompanhamento e
              gestão de denúncias corporativas em ambiente B2B, com recursos de anonimização e auditoria.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">2. Perfis e responsabilidades</h2>
            <p>
              A empresa contratante atua como controladora dos dados e responsável pela finalidade do tratamento.
              A JobComplaint atua como operadora no processamento técnico dos dados conforme instruções da controladora.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">3. Uso permitido e proibido</h2>
            <p>
              É proibido utilizar a plataforma para relatos sabidamente falsos, fraude, assédio digital,
              testes de invasão não autorizados ou quaisquer atividades ilícitas.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">4. Segurança e trilha de auditoria</h2>
            <p>
              A plataforma registra eventos técnicos e operacionais para garantir rastreabilidade e integridade
              do fluxo investigativo, respeitando controles de acesso e políticas de retenção.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">5. Limitação e não substituição de assessoria jurídica</h2>
            <p>
              A plataforma é uma solução tecnológica de suporte à governança e compliance. Ela não substitui
              avaliação jurídica, perícia técnica independente ou decisão formal da organização.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">6. Suspensão e encerramento</h2>
            <p>
              O acesso pode ser suspenso em caso de uso indevido, violação de segurança, descumprimento legal
              ou risco relevante à integridade da operação.
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-2">7. Foro e legislação aplicável</h2>
            <p>
              Aplicam-se as leis brasileiras, em especial normas de proteção de dados, legislação trabalhista
              e regras de governança aplicáveis ao contexto da empresa contratante.
            </p>
          </div>
        </section>

        <div className="grid sm:grid-cols-2 gap-3">
          <Link href="/politica-de-privacidade" className="border border-border rounded-sm p-4 hover:bg-secondary/40 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Política de Privacidade</p>
            </div>
            <p className="text-xs text-muted-foreground">Base legal, direitos do titular e retenção de dados.</p>
          </Link>
          <div className="border border-border rounded-sm p-4">
            <div className="flex items-center gap-2 mb-1">
              <Scale className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Condições de Compliance</p>
            </div>
            <p className="text-xs text-muted-foreground">
              A organização contratante deve manter políticas internas, comitê responsável e fluxo de resposta.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
