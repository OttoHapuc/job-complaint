"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Shield,
  LayoutDashboard,
  Inbox,
  Settings,
  ShieldCheck,
  ChevronRight,
  Bell,
  Menu,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const NAV_ITEMS = [
  { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
  { href: "/dashboard/casos", label: "Caixa de Casos", icon: Inbox, badge: 3 },
  { href: "/dashboard/lgpd", label: "Solicitações LGPD", icon: ShieldCheck },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings },
]

function getBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)
  const crumbs = [{ label: "Dashboard", href: "/dashboard" }]
  if (segments[1] === "casos") {
    crumbs.push({ label: "Caixa de Casos", href: "/dashboard/casos" })
    if (segments[2]) crumbs.push({ label: `Caso #${segments[2].toUpperCase()}`, href: `/dashboard/casos/${segments[2]}` })
  } else if (segments[1] === "configuracoes") {
    crumbs.push({ label: "Configurações", href: "/dashboard/configuracoes" })
  } else if (segments[1] === "lgpd") {
    crumbs.push({ label: "Solicitações LGPD", href: "/dashboard/lgpd" })
  }
  return crumbs
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userName, setUserName] = useState("Usuário")
  const [userRole, setUserRole] = useState("Conselho")
  const [tenantName, setTenantName] = useState("Empresa")
  const [isCorporateAccount, setIsCorporateAccount] = useState(false)
  const breadcrumbs = getBreadcrumbs(pathname)

  useEffect(() => {
    const loadMe = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" })
        if (!response.ok) {
          if (response.status === 403) {
            await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined)
          }
          router.push("/auth/login")
          return
        }

        const data = await response.json()
        setUserName(data.user?.name ?? "Usuário")
        setUserRole(data.user?.isCorporateAccount ? "Conta Corporativa" : "Conselho")
        setTenantName(data.user?.tenantName ?? "Empresa")
        setIsCorporateAccount(data.user?.isCorporateAccount === true)
      } catch {
        router.push("/auth/login")
      }
    }

    void loadMe()
  }, [router])

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/auth/login")
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-60 bg-sidebar border-r border-sidebar-border flex flex-col z-50 transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 lg:static lg:z-auto`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-sidebar-foreground" />
            <span className="font-semibold tracking-tight text-sm text-sidebar-foreground">JobComplaint</span>
          </Link>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS
            .filter((item) => {
              if (isCorporateAccount) {
                return item.href === "/dashboard" || item.href === "/dashboard/configuracoes"
              }
              if (item.href === "/dashboard/configuracoes") {
                return false
              }
              if (item.href === "/dashboard/lgpd") {
                return false
              }
              return true
            })
            .map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <Badge className="text-[10px] h-4 px-1.5 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs bg-sidebar-accent text-sidebar-accent-foreground">MA</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-sidebar-foreground truncate">{userName}</p>
                <p className="text-xs text-sidebar-foreground/40 truncate">
                  {userRole}
                  {isCorporateAccount ? ` · ${tenantName}` : ""}
                </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 border-b border-border bg-card flex items-center gap-4 px-6 sticky top-0 z-30 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-muted-foreground hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Breadcrumbs */}
          <nav className="flex items-center gap-1.5 flex-1 min-w-0">
            {breadcrumbs.map((crumb, i) => (
              <div key={crumb.href} className="flex items-center gap-1.5 min-w-0">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                {i === breadcrumbs.length - 1 ? (
                  <span className="text-sm font-medium text-foreground truncate">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate">
                    {crumb.label}
                  </Link>
                )}
              </div>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="outline" size="sm" className="text-xs h-8 px-3" onClick={logout}>
              Sair
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
            </Button>
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs bg-secondary text-foreground">MA</AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
