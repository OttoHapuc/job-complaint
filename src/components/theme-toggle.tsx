"use client"

import { useEffect, useSyncExternalStore } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

const THEME_STORAGE_KEY = "jc_theme"
const THEME_CHANGE_EVENT = "jc-theme-change"

type ThemeMode = "light" | "dark"

function getPreferredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light"
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved === "light" || saved === "dark") return saved
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.style.colorScheme = theme
}

function subscribeTheme(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  media.addEventListener("change", onStoreChange)
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    media.removeEventListener("change", onStoreChange)
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    () => getPreferredTheme(),
    (): ThemeMode => "light",
  )

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark"
    applyTheme(nextTheme)
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="fixed top-3 right-3 z-[120] h-9 w-9"
      onClick={toggleTheme}
      title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
      aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
