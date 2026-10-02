import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { CalendarDays, ClipboardCheck, Gavel, LayoutGrid, LogOut, Mail, Menu, PanelLeftClose, PanelLeftOpen, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { routes } from "@/routes/paths";
import { apiFetch } from "@/services/api";
import { useAuth } from "@/features/auth/AuthProvider";

const jansenNavigation = [
  { href: routes.painel, label: "Dashboard Jansen", icon: LayoutGrid },
  { href: routes.intimacoes, label: "Intimações", icon: Mail },
  { href: routes.clientes, label: "Clientes", icon: UsersRound },
  { href: routes.tarefas, label: "Tarefas", icon: ClipboardCheck },
  { href: routes.calendario, label: "Calendário", icon: CalendarDays },
  { href: routes.audiencias, label: "Audiências", icon: Gavel },
];

const sajulbraNavigation = [
  { href: routes.sajulbraInicio, label: "Dashboard Sajulbra", icon: LayoutGrid, section: true },
  { href: routes.sajulbraIntimacoes, label: "Intimações", icon: Mail },
  { href: routes.sajulbraAssistidos, label: "Assistidos", icon: UsersRound },
  { href: routes.sajulbraCalendario, label: "Calendário", icon: CalendarDays },
  { href: routes.sajulbraAudiencias, label: "Audiências", icon: Gavel },
];

function isNavigationItemActive(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getActiveNavigationHref(pathname: string) {
  return [...jansenNavigation, ...sajulbraNavigation]
    .filter(({ href }) => isNavigationItemActive(href, pathname))
    .sort((first, second) => second.href.length - first.href.length)[0]?.href;
}

function Navigation({ onNavigate, pendingIntimations, collapsed = false }: { onNavigate?: () => void; pendingIntimations: number | null; collapsed?: boolean }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const activeHref = getActiveNavigationHref(pathname);

  return (
    <nav className="sidebar-navigation flex min-h-0 flex-1 flex-col px-3" aria-label="Navegação principal">
      <div className="sidebar-nav-group space-y-0.5">
        {jansenNavigation.map(({ href, label, icon: Icon }) => {
          const active = href === activeHref;
          return (
            <NavLink
              key={href}
              to={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                "sidebar-nav-item group flex h-[42px] shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59b00]",
                collapsed && "relative justify-center px-0",
                active
                  ? "border border-[#3b3440] bg-[#1c1d2b] text-[#f59b00]"
                  : "text-[#9aa9bf] hover:bg-white/[0.045] hover:text-white",
              )}
            >
              <Icon aria-hidden="true" className={cn("size-[18px]", active ? "text-[#f59b00]" : "text-[#8797ad] group-hover:text-white")} strokeWidth={1.8} />
              {!collapsed && <span>{label}</span>}
              {href === routes.intimacoes && pendingIntimations !== null && (
                <span
                  className={cn("grid h-[22px] min-w-[22px] place-items-center rounded-full bg-[#f6a000] px-1.5 text-[11px] font-bold text-[#101725]", collapsed ? "absolute right-0.5 top-0 size-[18px] min-w-0 px-0 text-[9px]" : "ml-auto")}
                  aria-label={`${pendingIntimations} intimações pendentes de análise`}
                  aria-live="polite"
                >
                  {pendingIntimations}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>

      <div className="sidebar-divider border-t border-[#3b4554]" />

      <div className="sidebar-nav-group space-y-0.5">
        {sajulbraNavigation.map(({ href, label, icon: Icon, section }) => {
          const active = href === activeHref;
          return (
            <NavLink
              key={href}
              to={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                "sidebar-nav-item group flex h-[42px] shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors hover:bg-white/[0.045] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59b00]",
                collapsed && "justify-center px-0",
                active ? "border border-[#3b3440] bg-[#1c1d2b] text-[#f59b00]" : "text-[#9aa9bf]",
                section && "sidebar-section-heading mb-5",
              )}
            >
              <Icon aria-hidden="true" className={cn("size-[18px]", active ? "text-[#f59b00]" : "text-[#8797ad] group-hover:text-white")} strokeWidth={1.8} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          );
        })}
      </div>

      <div className="sidebar-profile mt-auto shrink-0 border-t border-[#3b4554] pt-4">
        <div className={cn("px-3", collapsed && "sr-only")}>
          <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
          <p className="mt-0.5 truncate text-xs text-[#788aa2]">{user?.email}</p>
        </div>
        <button type="button" onClick={() => void logout()} aria-label="Sair" title={collapsed ? "Sair" : undefined} className={cn("mt-3 flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#9aa9bf] transition-colors hover:bg-white/[0.045] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59b00]", collapsed && "justify-center px-0")}>
          <LogOut className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />{!collapsed && "Sair"}
        </button>
      </div>
    </nav>
  );
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className={cn("shrink-0", collapsed ? "size-10 overflow-hidden" : "w-[150px]")}>
      <img src="/jansen-logo-horizontal.png" alt="Jansen Advocacia" className={cn("max-w-none", collapsed ? "h-10 w-auto" : "h-auto w-[150px]")} />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [pendingIntimations, setPendingIntimations] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("jansen:sidebar-collapsed") === "true");

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem("jansen:sidebar-collapsed", String(next));
      return next;
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadPendingIntimations() {
      try {
        const response = await apiFetch("/api/intimations/pending-count", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json() as { count?: number; error?: string };
        if (!response.ok) throw new Error(data.error || "Falha ao carregar intimações pendentes.");

        const count = Number(data.count);
        if (active && Number.isFinite(count) && count >= 0) setPendingIntimations(count);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("[PENDING_INTIMATIONS_COUNT]", error);
      }
    }

    void loadPendingIntimations();
    const intervalId = window.setInterval(() => void loadPendingIntimations(), 30_000);
    const refreshOnFocus = () => void loadPendingIntimations();
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[#f6f8fa] text-[#121b2d]">
      <aside className={cn("sidebar-shell fixed inset-y-0 left-0 z-40 hidden h-dvh flex-col overflow-hidden border-r border-white/[0.05] bg-[#09111f] transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex", sidebarCollapsed ? "w-[84px]" : "w-[300px]")}>
        <div className={cn("sidebar-brand relative flex shrink-0 items-center px-6 pt-4", sidebarCollapsed ? "justify-center" : "justify-start")}>
          {sidebarCollapsed ? (
            <button type="button" onClick={toggleSidebar} aria-label="Expandir barra lateral" aria-expanded="false" className="group relative grid size-11 cursor-pointer place-items-center rounded-xl text-[#8fa0b7] transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59b00]">
              <span aria-hidden="true" className="absolute inset-0 grid place-items-center transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0 motion-reduce:transition-none"><Brand collapsed /></span>
              <PanelLeftOpen className="size-5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" aria-hidden="true" />
            </button>
          ) : (
            <>
              <Brand />
              <button type="button" onClick={toggleSidebar} aria-label="Recolher barra lateral" aria-expanded="true" className="absolute right-3 top-4 grid size-9 cursor-pointer place-items-center rounded-lg text-[#8fa0b7] transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59b00]">
                <PanelLeftClose className="size-5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        <Navigation pendingIntimations={pendingIntimations} collapsed={sidebarCollapsed} />
      </aside>

      <div className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#e0e5eb] bg-white px-4 lg:hidden">
        <img
          src="/jansen-logo-horizontal.png"
          alt="Jansen Advocacia"
          className="h-auto w-[120px] brightness-0"
        />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menu" className="rounded-lg text-slate-700 hover:bg-slate-100"><Menu /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="sidebar-shell flex h-dvh w-[300px] flex-col overflow-hidden border-white/[0.05] bg-[#09111f] p-0 text-white">
            <SheetTitle className="sr-only">Menu principal</SheetTitle>
            <div className="sidebar-brand shrink-0 px-6 pt-4"><Brand /></div>
            <Navigation pendingIntimations={pendingIntimations} />
          </SheetContent>
        </Sheet>
      </div>

      <main className={cn("transition-[padding] duration-200 ease-out motion-reduce:transition-none", sidebarCollapsed ? "lg:pl-[84px]" : "lg:pl-[300px]")}>{children}</main>
    </div>
  );
}
