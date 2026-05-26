"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

const THEME_STORAGE_KEY = "jc_theme"

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

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light")

  useEffect(() => {
    const initialTheme = getPreferredTheme()
    setTheme(initialTheme)
    applyTheme(initialTheme)
  }, [])

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark"
    setTheme(nextTheme)
    applyTheme(nextTheme)
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
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

