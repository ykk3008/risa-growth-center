"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, Megaphone, KanbanSquare, Building2, ListTodo, Target, Database, Bot, CalendarDays } from "lucide-react";
import { useApp } from "./app-context";
import { Copilot } from "./copilot";

const SECTIONS = [
  { label: "Analyse", items: [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  ] },
  { label: "Act", items: [
    { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
    { href: "/brands", label: "Brands", icon: Building2 },
    { href: "/tasks", label: "Tasks", icon: ListTodo },
  ] },
  { label: "Plan", items: [
    { href: "/plan", label: "2027 Plan", icon: Target },
    { href: "/data", label: "Data & Settings", icon: Database },
  ] },
];
const NAV = SECTIONS.flatMap((s) => s.items);

const QUICK = [["15 Feb", "2025-02-15"], ["1 Mar", "2025-03-01"], ["15 Mar", "2025-03-15"], ["1 Apr", "2025-04-01"], ["11 Apr", "2025-04-11"], ["20 Apr", "2025-04-20"]];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { asOf, setAsOf, copilotOpen, setCopilotOpen } = useApp();
  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f7fb] text-slate-900">
      <aside className="hidden w-56 shrink-0 flex-col text-slate-200 md:flex" style={{ background: "linear-gradient(180deg, #030c5b 0%, #0a1f7a 100%)" }}>
        <div className="flex items-center gap-2.5 px-4 pb-5 pt-5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l5-5 4 4 8-8" className="text-sky-300" stroke="currentColor" /><path d="M15 8h5v5" className="text-sky-300" stroke="currentColor" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-white">Sponsorship Growth</div>
            <div className="text-[11px] text-slate-300">CampusFest sponsor desk</div>
          </div>
        </div>
        <nav className="flex-1 space-y-5 px-3">
          {SECTIONS.map((s) => (
            <div key={s.label}>
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{s.label}</div>
              <div className="space-y-0.5">
                {s.items.map(({ href, label, icon: Icon }) => {
                  const active = path === href;
                  return (
                    <Link key={href} href={href} className={clsx("group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                      active ? "bg-white text-navy shadow-sm" : "text-slate-200 hover:bg-white/10 hover:text-white")}>
                      <Icon size={16} className={active ? "text-brand-600" : "text-slate-400 group-hover:text-white"} /> {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="m-3 rounded-xl bg-white/5 p-3 text-[11px] leading-snug text-slate-300 ring-1 ring-white/10">
          Source: the provided sponsor dataset (fictional). Budgets and payments are simulated and tagged <span className="font-semibold text-amber-300">SIM</span>.
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/90 px-5 py-2.5 backdrop-blur">
          <nav className="flex gap-1 md:hidden">
            {NAV.map(({ href, icon: Icon, label }) => <Link key={href} href={href} title={label} className={clsx("rounded p-1.5", path === href ? "bg-slate-200" : "")}><Icon size={16} /></Link>)}
          </nav>
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Data as of</span>
            <input type="date" value={asOf} min="2025-01-15" max="2026-12-31" onChange={(e) => e.target.value && setAsOf(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none" />
          </div>
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {QUICK.map(([l, d]) => (
              <button key={d} onClick={() => setAsOf(d)} title={d === "2025-04-11" ? "Day before the fest" : d === "2025-04-20" ? "End of the dataset" : undefined}
                className={clsx("rounded-md px-2.5 py-1 text-xs font-medium transition", asOf === d ? "bg-white text-navy shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800")}>{l}</button>
            ))}
          </div>
          <span className="hidden text-[11px] text-slate-400 2xl:inline">End of day IST. Later events stay hidden, so no look ahead.</span>
          <button onClick={() => setCopilotOpen(!copilotOpen)} className={clsx("ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm transition",
            copilotOpen ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "bg-brand-600 text-white hover:bg-brand-700")}>
            <Bot size={16} /> {copilotOpen ? "Hide copilot" : "AI copilot"}
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">{children}</main>
          {copilotOpen && <Copilot />}
        </div>
      </div>
    </div>
  );
}
