"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardCheck, Gavel, LayoutGrid, Mail, Menu, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const jansenNavigation = [
  { href: "/", label: "Dashboard Jansen", icon: LayoutGrid },
  { href: "/intimacoes", label: "Intimações", icon: Mail, badge: "12" },
  { href: "/clientes", label: "Clientes", icon: UsersRound },
  { href: "/tarefas", label: "Tarefas", icon: ClipboardCheck },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/audiencias", label: "Audiências", icon: Gavel },
];

const sajulbraNavigation = [
  { href: "/sajulbra", label: "Dashboard Sajulbra", icon: LayoutGrid, section: true },
  { href: "/sajulbra/intimacoes", label: "Intimações", icon: Mail },
  { href: "/sajulbra/assistidos", label: "Assistidos", icon: UsersRound },
  { href: "/sajulbra/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/sajulbra/audiencias", label: "Audiências", icon: Gavel },
];

function isNavigationItemActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="mt-10 px-3" aria-label="Navegação principal">
      <div className="space-y-0.5">
        {jansenNavigation.map(({ href, label, icon: Icon, badge }) => {
          const active = isNavigationItemActive(href, pathname);
          return (
            <a
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-[42px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59b00]",
                active
                  ? "border border-[#3b3440] bg-[#1c1d2b] text-[#f59b00]"
                  : "text-[#9aa9bf] hover:bg-white/[0.045] hover:text-white",
              )}
            >
              <Icon aria-hidden="true" className={cn("size-[18px]", active ? "text-[#f59b00]" : "text-[#8797ad] group-hover:text-white")} strokeWidth={1.8} />
              <span>{label}</span>
              {badge && <span className="ml-auto grid size-[22px] place-items-center rounded-full bg-[#f6a000] text-[11px] font-bold text-[#101725]">{badge}</span>}
            </a>
          );
        })}
      </div>

      <div className="mb-10 mt-6 border-t border-[#3b4554]" />

      <div className="space-y-0.5">
        {sajulbraNavigation.map(({ href, label, icon: Icon, section }) => {
          const active = isNavigationItemActive(href, pathname);
          return (
            <a
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-[42px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors hover:bg-white/[0.045] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f59b00]",
                active ? "border border-[#3b3440] bg-[#1c1d2b] text-[#f59b00]" : "text-[#9aa9bf]",
                section && "mb-5",
              )}
            >
              <Icon aria-hidden="true" className={cn("size-[18px]", active ? "text-[#f59b00]" : "text-[#8797ad] group-hover:text-white")} strokeWidth={1.8} />
              <span>{label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function Brand() {
  return (
    <div className="px-6 pt-6">
      <Image
        src="/jansen-logo-horizontal.png"
        alt="Jansen Advocacia"
        width={3590}
        height={950}
        priority
        className="h-auto w-[150px]"
      />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f8fa] text-[#121b2d]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[300px] border-r border-white/[0.05] bg-[#09111f] lg:block">
        <Brand />
        <Navigation />
      </aside>

      <div className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#e0e5eb] bg-white px-4 lg:hidden">
        <Image
          src="/jansen-logo-horizontal.png"
          alt="Jansen Advocacia"
          width={3590}
          height={950}
          priority
          className="h-auto w-[120px] brightness-0"
        />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menu" className="rounded-lg text-slate-700 hover:bg-slate-100"><Menu /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] border-white/[0.05] bg-[#09111f] p-0 text-white">
            <SheetTitle className="sr-only">Menu principal</SheetTitle>
            <Brand />
            <Navigation />
          </SheetContent>
        </Sheet>
      </div>

      <main className="lg:pl-[300px]">{children}</main>
    </div>
  );
}
