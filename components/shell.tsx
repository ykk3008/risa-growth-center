"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, Megaphone, KanbanSquare, Building2, ListTodo, Target, Database, Bot } from "lucide-react";
import { useApp } from "./app-context";
import { Copilot } from "./copilot";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/brands", label: "Brands", icon: Building2 },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/plan", label: "2027 Plan", icon: Target },
  { href: "/data", label: "Data & Settings", icon: Database },
];

const QUICK = [["15 Feb", "2025-02-15"], ["1 Mar", "2025-03-01"], ["15 Mar", "2025-03-15"], ["1 Apr", "2025-04-01"], ["11 Apr (T-1)", "2025-04-11"], ["20 Apr (end)", "2025-04-20"]];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { asOf, setAsOf, copilotOpen, setCopilotOpen } = useApp();
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <aside className="hidden w-52 shrink-0 flex-col bg-slate-900 text-slate-200 md:flex">
        <div className="px-4 py-4">
          <div className="text-sm font-bold text-white">Sponsorship Growth Center</div>
          <div className="text-[11px] text-slate-400">CampusFest · sponsor acquisition</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={clsx("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", path === href ? "bg-slate-700 text-white" : "hover:bg-slate-800")}>
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 text-[10px] leading-snug text-slate-500">Source: provided Sponsor Dataset (fictional). Budgets &amp; payments are simulated and tagged <span className="text-amber-400">SIM</span>.</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <nav className="flex gap-1 md:hidden">
            {NAV.map(({ href, icon: Icon, label }) => <Link key={href} href={href} title={label} className={clsx("rounded p-1.5", path === href ? "bg-slate-200" : "")}><Icon size={16} /></Link>)}
          </nav>
          <span className="text-xs font-medium text-slate-500">Data as of</span>
          <input type="date" value={asOf} min="2025-01-15" max="2026-12-31" onChange={(e) => e.target.value && setAsOf(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          <div className="flex flex-wrap gap-1">
            {QUICK.map(([l, d]) => (
              <button key={d} onClick={() => setAsOf(d)} className={clsx("rounded-full px-2 py-0.5 text-xs", asOf === d ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>{l}</button>
            ))}
          </div>
          <span className="hidden text-[11px] text-slate-400 lg:inline">end of day IST · later events are hidden (no look-ahead)</span>
          <button onClick={() => setCopilotOpen(!copilotOpen)} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            <Bot size={16} /> {copilotOpen ? "Hide copilot" : "AI copilot"}
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto p-4">{children}</main>
          {copilotOpen && <Copilot />}
        </div>
      </div>
    </div>
  );
}
