"use client"

import { AccountActivityFeed } from "@/components/account-activity-feed"

export default function MinhaAtividadePage() {
  return (
    <div className="px-6 py-8 space-y-4">
      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
          Auditoria pessoal
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Minha Atividade</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Histórico filtrado de acessos, alterações de senha e eventos da sua conta.
        </p>
      </div>
      <AccountActivityFeed title="Seus eventos" />
    </div>
  )
}
