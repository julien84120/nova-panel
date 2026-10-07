import { useEffect, useState } from "react"
import { Outlet } from "react-router-dom"

import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Header } from "./Header"
import { Sidebar } from "./Sidebar"

const COLLAPSE_KEY = "novapanel.sidebar.collapsed"

export function Layout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1")
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0")
  }, [collapsed])

  return (
    <TooltipProvider>
      <div className="flex h-full overflow-hidden">
        {/* Sidebar desktop */}
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} className="hidden lg:flex" />

        {/* Sidebar mobile (drawer) */}
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden",
            mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 transition-transform duration-300 lg:hidden",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
        </div>

        {/* Contenu */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onOpenMobileNav={() => setMobileOpen(true)} />
          <main className="nova-glow flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6 lg:p-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
