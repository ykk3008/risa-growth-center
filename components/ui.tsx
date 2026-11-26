"use client";
import clsx from "clsx";
import React from "react";

export const inr = (n: number | null | undefined) => {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`;
  return `₹${Math.round(n)}`;
};
export const lakh = (l: number) => (l >= 100 ? `₹${(l / 100).toFixed(2)}Cr` : `₹${l.toFixed(1)}L`);
export const pct = (x: number | null | undefined, d = 0) => (x === null || x === undefined || !isFinite(x) ? "—" : `${(x * 100).toFixed(d)}%`);
export const num = (x: number | null | undefined, d = 0) => (x === null || x === undefined ? "—" : x.toLocaleString("en-IN", { maximumFractionDigits: d }));

export function Card({ title, subtitle, right, children, className }: { title?: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      {(title || right) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone = "default", hint }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "default" | "good" | "warn" | "bad"; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" title={hint}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={clsx("mt-1 text-2xl font-semibold", { "text-slate-900": tone === "default", "text-emerald-700": tone === "good", "text-amber-700": tone === "warn", "text-rose-700": tone === "bad" })}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" | "violet" }) {
  const m = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-rose-100 text-rose-800", blue: "bg-sky-100 text-sky-800", violet: "bg-violet-100 text-violet-800" };
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", m[tone])}>{children}</span>;
}

export const verdictTone = (v: string) => (v === "SCALE" ? "green" : v === "STOP" ? "red" : v === "CHANGE" ? "amber" : "slate") as "green" | "red" | "amber" | "slate";
export const stageTone = (s: string) => (s === "partner_confirmed" ? "green" : s === "lost" || s === "withdrawn" ? "red" : s === "negotiating" ? "violet" : s === "proposal_sent" ? "blue" : "slate") as "green" | "red" | "violet" | "blue" | "slate";

export function Button({ children, onClick, variant = "primary", disabled, type = "button", className }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean; type?: "button" | "submit"; className?: string }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className={clsx("inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50", {
        "bg-indigo-600 text-white hover:bg-indigo-700": variant === "primary",
        "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50": variant === "secondary",
        "bg-rose-600 text-white hover:bg-rose-700": variant === "danger",
        "text-slate-600 hover:bg-slate-100": variant === "ghost",
      }, className)}>
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-600">{label}<div className="mt-1">{children}</div></label>;
}
export const inputCls = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none";

export function Table({ head, children, className }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("overflow-x-auto", className)}>
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">{head.map((h, i) => <th key={i} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function SimTag() {
  return <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] font-semibold uppercase text-amber-700 ring-1 ring-amber-200" title="Simulated: the source dataset has no such data">sim</span>;
}

export function Loading() { return <div className="p-8 text-sm text-slate-500">Loading…</div>; }
export function ErrorBox({ error }: { error: string }) { return <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>; }
