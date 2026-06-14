"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type ActivityItem = {
  id: string
  action: string
  label: string
  occurredAt: string
  actor: string
  payload: Record<string, unknown> | null
}

type ActivityUser = {
  id: string
  name: string
  email: string
  lastLoginAt: string | null
  passwordChangedAt: string | null
  mustChangePassword: boolean
}

export function AccountActivityFeed(props: { userId?: string; title?: string }) {
  return <AccountActivityFeedBody key={props.userId ?? "self"} {...props} />
}

function AccountActivityFeedBody(props: { userId?: string; title?: string }) {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [user, setUser] = useState<ActivityUser | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const cursorRef = useRef<string | null>(null)

  const fetchPage = useCallback(async (cursor?: string | null) => {
    const params = new URLSearchParams()
    if (props.userId) params.set("userId", props.userId)
    if (cursor) params.set("cursor", cursor)
    params.set("limit", "15")

    const response = await fetch(`/api/audit/account-activity?${params.toString()}`, {
      cache: "no-store",
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.error ?? "Não foi possível carregar atividade.")
    }
    return data as {
      user: ActivityUser
      activity: { items: ActivityItem[]; nextCursor: string | null; hasMore: boolean }
    }
  }, [props.userId])

  useEffect(() => {
    void fetchPage(null)
      .then((data) => {
        setUser(data.user ?? null)
        setItems(data.activity?.items ?? [])
        cursorRef.current = data.activity?.nextCursor ?? null
        setNextCursor(data.activity?.nextCursor ?? null)
        setHasMore(Boolean(data.activity?.hasMore))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [fetchPage, props.userId])

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return
    const node = sentinelRef.current
    if (!node) return

    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || loadingMore || !cursorRef.current) return
      setLoadingMore(true)
      void fetchPage(cursorRef.current)
        .then((data) => {
          setItems((prev) => [...prev, ...(data.activity?.items ?? [])])
          cursorRef.current = data.activity?.nextCursor ?? null
          setNextCursor(data.activity?.nextCursor ?? null)
          setHasMore(Boolean(data.activity?.hasMore))
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoadingMore(false))
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [fetchPage, hasMore, loading, loadingMore, items.length])

  return (
    <div className="border border-border rounded-sm bg-card p-4 space-y-3">
      <div>
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
          {props.title ?? "Atividade da conta"}
        </p>
        {user && (
          <p className="text-xs text-muted-foreground mt-1">
            Último acesso: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("pt-BR") : "—"}
            {" · "}
            Senha alterada: {user.passwordChangedAt ? new Date(user.passwordChangedAt).toLocaleString("pt-BR") : "—"}
            {user.mustChangePassword ? " · troca obrigatória pendente" : ""}
          </p>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando histórico...</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {!loading && items.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
      )}

      <div className="space-y-2 max-h-72 overflow-auto">
        {items.map((item) => (
          <div key={item.id} className="border border-border rounded-sm px-3 py-2">
            <p className="text-sm font-medium">{item.label}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(item.occurredAt).toLocaleString("pt-BR")} · {item.actor}
            </p>
          </div>
        ))}
        <div ref={sentinelRef} className="h-1" />
        {loadingMore && <p className="text-xs text-muted-foreground">Carregando mais...</p>}
        {!hasMore && items.length > 0 && !loadingMore && (
          <p className="text-[11px] text-muted-foreground">Fim do histórico.</p>
        )}
      </div>
      {nextCursor ? null : null}
    </div>
  )
}
