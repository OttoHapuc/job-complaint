"use client"

import { useEffect, useState } from "react"
import {
  Check,
  UserPlus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type Member = {
  id: string
  name: string
  companyRole: string
  email: string
  isCorporateAccount?: boolean
  isActive: boolean
  createdAt: string
}

type PlanItem = {
  planCode: "STARTER" | "BUSINESS" | "ENTERPRISE"
  name: string
  seatLimit: number
  aiMonthlyLimit: number
  features: string[]
}

type TenantPlan = {
  id: string
  name: string
  code: string
  planCode: "STARTER" | "BUSINESS" | "ENTERPRISE"
  planName: string
  seatLimit: number
  aiMonthlyLimit: number
  seatsUsed: number
  seatsAvailable: number
  seatUsagePercent: number
  billingEmail: string | null
  aiUsedThisMonth: number
  aiRemainingThisMonth: number
}

export default function ConfiguracoesPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [availablePlans, setAvailablePlans] = useState<PlanItem[]>([])
  const [tenantPlan, setTenantPlan] = useState<TenantPlan | null>(null)
  const [planError, setPlanError] = useState("")
  const [membersError, setMembersError] = useState("")
  const [isLoadingMembers, setIsLoadingMembers] = useState(true)
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false)
  const [showMemberForm, setShowMemberForm] = useState(false)
  const [newMemberName, setNewMemberName] = useState("")
  const [newMemberCompanyRole, setNewMemberCompanyRole] = useState("")
  const [newMemberEmail, setNewMemberEmail] = useState("")
  const [newMemberPassword, setNewMemberPassword] = useState("")
  const [memberCompanyRoleDrafts, setMemberCompanyRoleDrafts] = useState<Record<string, string>>({})
  const [memberActiveDrafts, setMemberActiveDrafts] = useState<Record<string, boolean>>({})
  const [newMemberIsActive, setNewMemberIsActive] = useState(true)

  const loadPlan = async () => {
    try {
      const response = await fetch("/api/saas/plan", {
        cache: "no-store",
      })
      if (!response.ok) {
        setPlanError("Não foi possível carregar plano atual.")
        return
      }
      const data = await response.json()
      setTenantPlan(data.tenant ?? null)
      setAvailablePlans(data.availablePlans ?? [])
      setPlanError("")
    } catch {
      setPlanError("Falha de conexão ao carregar plano.")
    }
  }

  const loadMembers = async () => {
    setIsLoadingMembers(true)
    try {
      const response = await fetch("/api/settings/members", {
        cache: "no-store",
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setMembersError(body.error ?? "Não foi possível carregar membros.")
        return
      }

      const data = await response.json()
      setMembers(
        (data.members ?? []).map((member: { id: string; name: string; companyRole: string; email: string; isCorporateAccount?: boolean; isActive: boolean; createdAt: string }) => ({
          id: member.id,
          name: member.name,
          companyRole: member.companyRole,
          email: member.email,
          isCorporateAccount: member.isCorporateAccount === true,
          isActive: member.isActive ?? true,
          createdAt: member.createdAt,
        })),
      )
      setMemberCompanyRoleDrafts(
        Object.fromEntries(
          (data.members ?? []).map((member: { id: string; companyRole: string }) => [member.id, member.companyRole]),
        ),
      )
      setMemberActiveDrafts(
        Object.fromEntries(
          (data.members ?? []).map((member: { id: string; isActive: boolean }) => [member.id, member.isActive ?? true]),
        ),
      )
      setMembersError("")
    } catch {
      setMembersError("Falha de conexão ao carregar membros.")
    } finally {
      setIsLoadingMembers(false)
    }
  }

  useEffect(() => {
    const boot = async () => {
      await loadPlan()
      await loadMembers()
    }
    void boot()
  }, [])

  const changePlan = async (targetPlanCode: TenantPlan["planCode"]) => {
    if (!tenantPlan || tenantPlan.planCode === targetPlanCode) return

    const targetPlan = availablePlans.find((plan) => plan.planCode === targetPlanCode)
    if (!targetPlan) return

    const direction =
      targetPlan.planCode === tenantPlan.planCode
        ? "sem alteração"
        : targetPlan.seatLimit > tenantPlan.seatLimit
          ? "upgrade"
          : "downgrade"
    const confirmed = window.confirm(
      `Confirma ${direction} para ${targetPlan.name}?\n\n` +
        `Assentos: ${tenantPlan.seatLimit} -> ${targetPlan.seatLimit}\n` +
        `Limite IA/mês: ${tenantPlan.aiMonthlyLimit} -> ${targetPlan.aiMonthlyLimit}`,
    )
    if (!confirmed) return

    setIsUpdatingPlan(true)
    try {
      const response = await fetch("/api/saas/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planCode: targetPlanCode,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setPlanError(body.error ?? "Não foi possível atualizar o plano.")
        return
      }
      await loadPlan()
    } catch {
      setPlanError("Falha de conexão ao atualizar plano.")
    } finally {
      setIsUpdatingPlan(false)
    }
  }

  const createMember = async () => {
    if (!newMemberName.trim() || !newMemberCompanyRole.trim() || !newMemberEmail.trim() || !newMemberPassword.trim()) {
      setMembersError("Preencha nome, cargo, e-mail e senha para criar membro.")
      return
    }

    try {
      const response = await fetch("/api/settings/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newMemberName,
          companyRole: newMemberCompanyRole,
          email: newMemberEmail,
          password: newMemberPassword,
          isActive: newMemberIsActive,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMembersError(body.error ?? "Não foi possível criar membro.")
        return
      }
      setShowMemberForm(false)
      setNewMemberName("")
      setNewMemberCompanyRole("")
      setNewMemberEmail("")
      setNewMemberPassword("")
      setNewMemberIsActive(true)
      setMembersError("")
      await loadMembers()
      await loadPlan()
    } catch {
      setMembersError("Falha de conexão ao criar membro.")
    }
  }

  const updateMember = async (memberId: string) => {
    const companyRole = memberCompanyRoleDrafts[memberId]?.trim()
    if (!companyRole) return
    try {
      const response = await fetch(`/api/settings/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyRole,
          isActive: memberActiveDrafts[memberId] ?? true,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMembersError(body.error ?? "Não foi possível atualizar membro.")
        return
      }
      setMembersError("")
      await loadMembers()
    } catch {
      setMembersError("Falha de conexão ao atualizar membro.")
    }
  }

  return (
    <div className="px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Configurações</p>
        <h1 className="text-2xl font-bold tracking-tight">Gestão do Conselho e Plano</h1>
      </div>

      <div className="border border-border rounded-sm bg-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Plano SaaS</p>
            <p className="text-lg font-semibold tracking-tight">
              {tenantPlan ? `${tenantPlan.planName} (${tenantPlan.planCode})` : "Carregando plano..."}
            </p>
          </div>
          <Button variant="outline" size="sm" className="text-xs" onClick={loadPlan} disabled={isUpdatingPlan}>
            Atualizar Plano
          </Button>
        </div>
        {tenantPlan && (
          <div className="grid sm:grid-cols-3 gap-3 text-xs">
            <div className="border border-border rounded-sm p-3">
              <p className="text-muted-foreground mb-1">Assentos</p>
              <p className="font-semibold">
                {tenantPlan.seatsUsed}/{tenantPlan.seatLimit}
              </p>
            </div>
            <div className="border border-border rounded-sm p-3">
              <p className="text-muted-foreground mb-1">Limite IA / mês</p>
              <p className="font-semibold">
                {tenantPlan.aiUsedThisMonth}/{tenantPlan.aiMonthlyLimit}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                restante: {tenantPlan.aiRemainingThisMonth}
              </p>
            </div>
            <div className="border border-border rounded-sm p-3">
              <p className="text-muted-foreground mb-1">Billing</p>
              <p className="font-semibold truncate">{tenantPlan.billingEmail ?? "Não definido"}</p>
            </div>
          </div>
        )}
        {planError && <p className="text-xs text-red-600 dark:text-red-400">{planError}</p>}

        {tenantPlan && availablePlans.length > 0 && (
          <div className="grid lg:grid-cols-3 gap-3">
            {availablePlans.map((plan) => {
              const selected = tenantPlan.planCode === plan.planCode
              return (
                <div key={plan.planCode} className={`border rounded-sm p-4 ${selected ? "border-foreground bg-secondary/40" : "border-border"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">{plan.name}</p>
                    {selected ? <Badge className="text-[10px]">Atual</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">Assentos: {plan.seatLimit}</p>
                  <p className="text-xs text-muted-foreground mb-2">IA/mês: {plan.aiMonthlyLimit}</p>
                  <ul className="space-y-1 mb-3">
                    {plan.features.slice(0, 3).map((feature) => (
                      <li key={feature} className="text-[11px] text-muted-foreground flex items-start gap-1">
                        <Check className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    variant={selected ? "outline" : "default"}
                    className="text-xs w-full"
                    disabled={selected || isUpdatingPlan}
                    onClick={() => changePlan(plan.planCode)}
                  >
                    {selected ? "Plano Atual" : "Selecionar Plano"}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

        <div className="max-w-3xl space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {members.length} usuários cadastrados (conta corporativa + conselho)
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="text-xs" variant="outline" onClick={loadMembers} disabled={isLoadingMembers}>
                Atualizar
              </Button>
              <Button size="sm" className="gap-2 text-xs" onClick={() => setShowMemberForm((prev) => !prev)}>
                <UserPlus className="h-3.5 w-3.5" />
                Novo Membro
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Somente a conta corporativa gerencia configurações e membros. Integrantes profissionais acessam casos e resultados.
          </p>
          {membersError && <p className="text-xs text-red-600 dark:text-red-400">{membersError}</p>}

          {showMemberForm && (
            <div className="border border-border rounded-sm bg-card p-5 space-y-3">
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Criar Membro</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                />
                <input
                  value={newMemberCompanyRole}
                  onChange={(e) => setNewMemberCompanyRole(e.target.value)}
                  placeholder="Cargo na empresa (ex.: Analista de RH)"
                  className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="email@empresa.com"
                  className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  value={newMemberPassword}
                  onChange={(e) => setNewMemberPassword(e.target.value)}
                  type="password"
                  placeholder="Senha inicial (mín. 8)"
                  className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
                />
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newMemberIsActive}
                      onChange={(e) => setNewMemberIsActive(e.target.checked)}
                    />
                    membro ativo
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="text-xs" onClick={createMember}>Criar</Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowMemberForm(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          )}

          {/* Members table */}
          <div className="border border-border rounded-sm overflow-hidden">
            <div className="hidden md:grid grid-cols-[1.5fr_1.7fr_2fr_1.2fr_1fr_1fr] gap-4 px-5 py-3 bg-secondary border-b border-border">
              {["Nome", "E-mail", "Cargo", "Criado em", "Status", ""].map((col) => (
                <p key={col} className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{col}</p>
              ))}
            </div>
            <div className="divide-y divide-border">
              {isLoadingMembers && (
                <div className="px-5 py-4 text-sm text-muted-foreground">Carregando membros...</div>
              )}
              {!isLoadingMembers && members.length === 0 && (
                <div className="px-5 py-4 text-sm text-muted-foreground">Nenhum membro encontrado.</div>
              )}
              {!isLoadingMembers && members.map((m) => (
                <div key={m.id} className="flex flex-col md:grid md:grid-cols-[1.5fr_1.7fr_2fr_1.2fr_1fr_1fr] gap-2 md:gap-4 px-5 py-4 items-start md:items-center">
                  <span className="text-sm font-medium text-foreground">{m.name}</span>
                  <span className="text-sm text-muted-foreground font-mono text-xs">{m.email}</span>
                  {m.isCorporateAccount ? (
                    <span className="text-xs text-muted-foreground">Conta corporativa</span>
                  ) : (
                    <input
                      value={memberCompanyRoleDrafts[m.id] ?? m.companyRole}
                      onChange={(e) =>
                        setMemberCompanyRoleDrafts((prev) => ({
                          ...prev,
                          [m.id]: e.target.value,
                        }))
                      }
                      className="bg-background border border-border rounded-sm px-2 py-1 text-xs w-full"
                    />
                  )}
                  <span className="text-xs text-muted-foreground font-mono">
                    {new Date(m.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                  {m.isCorporateAccount ? (
                    <span className="text-xs text-muted-foreground">sempre ativa</span>
                  ) : (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={memberActiveDrafts[m.id] ?? m.isActive}
                        onChange={(e) =>
                          setMemberActiveDrafts((prev) => ({
                            ...prev,
                            [m.id]: e.target.checked,
                          }))
                        }
                      />
                      ativo
                    </label>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    disabled={m.isCorporateAccount}
                    onClick={() => updateMember(m.id)}
                  >
                    Salvar
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
    </div>
  )
}
