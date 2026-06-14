"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, Users, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"

type ImplicatedPerson = {
  displayNameHash: string
  visibleLabel: string
  roleHint: string
  totalMentions: number
  distinctCases: number
  lastMentionedAt: string
  cases: Array<{ externalId: string; status: string; mentionCount: number }>
}

export default function ImplicadosPage() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [people, setPeople] = useState<ImplicatedPerson[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError("")
      try {
        const params = new URLSearchParams()
        if (query.trim()) params.set("q", query.trim())
        const response = await fetch(`/api/dashboard/implicated-people?${params.toString()}`, {
          cache: "no-store",
        })
        if (response.status === 401) {
          router.push("/auth/login")
          return
        }
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          setError(data.error ?? "Não foi possível carregar implicados.")
          return
        }
        setPeople(data.people ?? [])
      } catch {
        setError("Falha de conexão ao carregar implicados.")
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [query, router])

  const totalMentions = useMemo(
    () => people.reduce((sum, person) => sum + person.totalMentions, 0),
    [people],
  )

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Painel</p>
        <h1 className="text-2xl font-bold tracking-tight">Pessoas Implicadas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registro agregado por identidade com recorrência entre casos.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou papel..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-sm bg-background"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {people.length} perfis · {totalMentions} menções totais
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando registro...</p>}
      {!isLoading && error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!isLoading && !error && people.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma pessoa implicada encontrada.</p>
      )}

      <div className="grid gap-4">
        {people.map((person) => (
          <div key={person.displayNameHash} className="border border-border rounded-sm p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">{person.visibleLabel}</h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{person.roleHint}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{person.distinctCases} casos</p>
                <p>{person.totalMentions} menções</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {person.cases.map((caseItem) => (
                <Link
                  key={`${person.displayNameHash}-${caseItem.externalId}`}
                  href={`/dashboard/casos/${caseItem.externalId.toLowerCase().replace("caso-", "")}`}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded-sm hover:bg-secondary/50"
                >
                  {caseItem.externalId}
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
