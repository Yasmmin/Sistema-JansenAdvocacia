"use client";

import { usePathname } from "next/navigation";
import { BellRing, BriefcaseBusiness, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Monitor DJEN", icon: BellRing },
  { href: "/clientes", label: "Clientes", icon: BriefcaseBusiness },
];

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <nav className="mt-8 space-y-1 px-3" aria-label="Navegação principal">
    {navigation.map(({ href, label, icon: Icon }) => {
      const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
      return <a key={href} href={href} onClick={onNavigate} className={cn("flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors", active ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/7 hover:text-white")}>
        <Icon className="size-[18px]" />{label}
      </a>;
    })}
  </nav>;
}

function Brand() {
  return <div className="flex items-center gap-3 px-5 pt-6"><div className="grid size-10 place-items-center rounded-lg border border-white/25 text-sm font-bold text-white">J</div><div><p className="font-semibold tracking-[0.14em] text-white">JANSEN</p><p className="mt-0.5 text-xs text-slate-400">Painel interno</p></div></div>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f3f5f7] text-slate-950">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-slate-800 bg-[#112b3d] md:block">
      <Brand /><Navigation />
      <p className="absolute bottom-6 left-5 right-5 text-xs leading-5 text-slate-400">Ambiente interno<br />OAB/RS 103.774</p>
    </aside>
    <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
      <div className="flex items-center gap-2.5"><div className="grid size-8 place-items-center rounded-md bg-[#112b3d] text-xs font-bold text-white">J</div><span className="font-semibold tracking-[0.1em] text-[#112b3d]">JANSEN</span></div>
      <Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Abrir menu"><Menu /></Button></SheetTrigger><SheetContent side="left" className="w-72 border-slate-800 bg-[#112b3d] p-0"><SheetTitle className="sr-only">Menu principal</SheetTitle><Brand /><Navigation /></SheetContent></Sheet>
    </div>
    <main className="md:pl-60">{children}</main>
  </div>;
}
