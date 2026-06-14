"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Shield } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AlterarSenhaPage() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (newPassword.length < 8) {
      setError("A nova senha deve ter no mínimo 8 caracteres.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("A confirmação da nova senha não confere.")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error ?? "Não foi possível alterar a senha.")
        return
      }
      router.replace("/dashboard")
      router.refresh()
    } catch {
      setError("Falha de conexão ao alterar senha.")
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.replace("/auth/login")
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md border border-border rounded-sm bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Defina sua nova senha</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Por segurança, você só pode continuar após criar uma senha pessoal.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Senha temporária atual"
            className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
            required
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Nova senha (mín. 8 caracteres)"
            className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
            required
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmar nova senha"
            className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm"
            required
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Salvando..." : "Salvar nova senha"}
          </Button>
        </form>

        <button type="button" onClick={logout} className="text-xs text-muted-foreground underline">
          Sair e voltar ao login
        </button>
      </div>
    </div>
  )
}
