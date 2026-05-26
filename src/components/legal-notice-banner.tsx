"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const NOTICE_KEY = "jc_privacy_notice_ack_v1"

export function LegalNoticeBanner() {
  const [dismissed, setDismissed] = useState(false)
  const acknowledged = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {}
      const handler = () => onStoreChange()
      window.addEventListener("storage", handler)
      return () => window.removeEventListener("storage", handler)
    },
    () => {
      if (typeof window === "undefined") return true
      return window.localStorage.getItem(NOTICE_KEY) === "true"
    },
    () => true,
  )

  const accept = () => {
    window.localStorage.setItem(NOTICE_KEY, "true")
    setDismissed(true)
  }

  if (acknowledged || dismissed) return null

  return (
    <div className="fixed bottom-3 left-3 right-3 z-[100] border border-border rounded-sm bg-card p-4">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <p className="text-xs text-muted-foreground leading-relaxed flex-1">
          Utilizamos dados estritamente necessários para segurança, compliance e operação da plataforma.
          Consulte nossos{" "}
          <Link href="/termos-de-uso" className="underline underline-offset-2 hover:text-foreground">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link href="/politica-de-privacidade" className="underline underline-offset-2 hover:text-foreground">
            Política de Privacidade
          </Link>
          . Para solicitações LGPD, acesse{" "}
          <Link href="/direitos-lgpd" className="underline underline-offset-2 hover:text-foreground">
            Direitos do Titular
          </Link>
          .
        </p>
        <Button size="sm" onClick={accept} className="text-xs">
          Entendi
        </Button>
      </div>
    </div>
  )
}
