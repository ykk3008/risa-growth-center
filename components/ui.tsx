"use client";
import clsx from "clsx";
import React from "react";

// ---------------------------------------------------------------- formatting
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
export const date = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return isNaN(+d) ? iso.slice(0, 10) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// ---------------------------------------------------------------- human labels
export const STAGE_LABEL: Record<string, string> = {
  prospecting: "Prospecting", contacted: "Contacted", proposal_sent: "Proposal sent", negotiating: "Negotiating",
  partner_confirmed: "Confirmed", lost: "Lost", withdrawn: "Withdrawn",
};
export const stageLabel = (s: string) => STAGE_LABEL[s] ?? humanize(s);

export const VERDICT_LABEL: Record<string, string> = { SCALE: "Scale", CHANGE: "Change", STOP: "Stop", TOO_EARLY: "Too early", NOT_MEASURABLE: "Not measurable yet" };
export const verdictLabel = (v: string) => VERDICT_LABEL[v] ?? humanize(v);

export const BET_LABEL: Record<string, string> = {
  warm: "Warm network engine", store: "Self serve sponsor store", verticals: "Separate vertical titles",
  anchor: "Anchor title, UPI powered fest", hybrid: "Hybrid performance deals",
};
export const betLabel = (k: string) => BET_LABEL[k] ?? humanize(k);

export const METRIC_LABEL: Record<string, string> = {
  intros_per_week: "Intros per week", intro_to_meeting: "Intro to meeting rate", submits_per_week: "Form submits per week",
  submit_to_meeting: "Submit to meeting rate", avg_ask_lakh: "Average ask", anchors_at_proposal_wk6: "Anchors at proposal by week 6",
  guaranteed_share: "Guaranteed share of deal",
};
export const metricLabel = (k: string) => METRIC_LABEL[k] ?? humanize(k);

export const QUAL_LABEL: Record<string, string> = { qualified: "Qualified", engaged: "Engaged", unqualified: "Unqualified", dormant: "Dormant", unreviewed: "Unreviewed", "not yet assessed": "Not assessed" };
export const TASK_STATUS_LABEL: Record<string, string> = { todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done" };

/** Clean machine-ish reason strings for display: symbols to words, no semicolons or em dashes. */
export function tidy(s?: string | null) {
  if (!s) return "";
  return s.replace(/\s*>=\s*/g, " at least ").replace(/\s*<=\s*/g, " at most ").replace(/\s*≥\s*/g, " at least ").replace(/\s*≤\s*/g, " at most ")
    .replace(/\s+—\s+/g, ", ").replace(/;\s*/g, ". ").replace(/->|→/g, "to").replace(/\(([^)]*)\)/g, ", $1");
}

export function humanize(s: string) {
  if (!s) return s;
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------- layout
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-tight text-navy">{title}</h1>
        {subtitle && <p className="mt-1 max-w-4xl text-[13px] leading-snug text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, right, children, className, pad = true }: { title?: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx("rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)]", pad && "p-5", className)}>
      {(title || right) && (
        <div className={clsx("mb-4 flex items-start justify-between gap-3", !pad && "px-5 pt-5")}>
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs leading-snug text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Progress({ value, tone = "brand", className }: { value: number; tone?: "brand" | "good" | "warn" | "bad"; className?: string }) {
  const v = Math.max(0, Math.min(1, isFinite(value) ? value : 0));
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className={clsx("h-full rounded-full", { "bg-brand-600": tone === "brand", "bg-emerald-500": tone === "good", "bg-amber-500": tone === "warn", "bg-rose-500": tone === "bad" })} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub, tone = "default", hint, progress, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "default" | "good" | "warn" | "bad"; hint?: string; progress?: number; icon?: React.ReactNode }) {
  const bar = tone === "good" ? "good" : tone === "warn" ? "warn" : tone === "bad" ? "bad" : "brand";
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]" title={hint}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <div className={clsx("mt-2 text-[26px] font-semibold leading-none tabular-nums tracking-tight", { "text-slate-900": tone === "default", "text-emerald-700": tone === "good", "text-amber-700": tone === "warn", "text-rose-700": tone === "bad" })}>{value}</div>
      {progress !== undefined && <Progress value={progress} tone={bar} className="mt-3" />}
      {sub && <div className="mt-2 text-xs leading-snug text-slate-500">{sub}</div>}
    </div>
  );
}

type Tone = "slate" | "green" | "amber" | "red" | "blue" | "violet" | "navy";
export function Badge({ children, tone = "slate", dot = false, title }: { children: React.ReactNode; tone?: Tone; dot?: boolean; title?: string }) {
  const m: Record<Tone, string> = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200", green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200", red: "bg-rose-50 text-rose-800 ring-rose-200",
    blue: "bg-sky-50 text-sky-800 ring-sky-200", violet: "bg-violet-50 text-violet-800 ring-violet-200", navy: "bg-brand-50 text-brand-700 ring-brand-200",
  };
  const d: Record<Tone, string> = { slate: "bg-slate-400", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-rose-500", blue: "bg-sky-500", violet: "bg-violet-500", navy: "bg-brand-600" };
  return (
    <span title={title} className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", m[tone])}>
      {dot && <span className={clsx("h-1.5 w-1.5 rounded-full", d[tone])} />}
      {children}
    </span>
  );
}

export const verdictTone = (v: string) => (v === "SCALE" ? "green" : v === "STOP" ? "red" : v === "CHANGE" ? "amber" : "slate") as "green" | "red" | "amber" | "slate";
export const stageTone = (s: string) => (s === "partner_confirmed" ? "green" : s === "lost" || s === "withdrawn" ? "red" : s === "negotiating" ? "violet" : s === "proposal_sent" ? "blue" : "slate") as "green" | "red" | "violet" | "blue" | "slate";

/** Scale / change / stop / too early / not measurable, with a human label. */
export function VerdictBadge({ v }: { v: string }) {
  return <Badge tone={v === "NOT_MEASURABLE" ? "slate" : verdictTone(v)} dot>{verdictLabel(v)}</Badge>;
}
export function StageBadge({ s }: { s: string }) {
  return <Badge tone={stageTone(s)}>{stageLabel(s)}</Badge>;
}

export function Button({ children, onClick, variant = "primary", disabled, type = "button", className, size = "md", title }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger" | "ghost" | "soft"; disabled?: boolean; type?: "button" | "submit"; className?: string; size?: "sm" | "md"; title?: string }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} title={title}
      className={clsx("inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition disabled:opacity-50", size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm", {
        "bg-brand-600 text-white shadow-sm hover:bg-brand-700": variant === "primary",
        "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50": variant === "secondary",
        "bg-rose-600 text-white hover:bg-rose-700": variant === "danger",
        "text-slate-600 hover:bg-slate-100": variant === "ghost",
        "border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100": variant === "soft",
      }, className)}>
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-600">{label}<div className="mt-1">{children}</div></label>;
}
export const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";
export const selectCls = "rounded-lg border border-slate-300 bg-white py-1.5 pl-2.5 pr-8 text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function Table({ head, children, className, align, maxHeight }: { head: React.ReactNode[]; children: React.ReactNode; className?: string; align?: ("l" | "r" | "c")[]; maxHeight?: string }) {
  return (
    <div className={clsx("gc-table -mx-1 overflow-x-auto", maxHeight && "overflow-y-auto", className)} style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
            {head.map((h, i) => <th key={i} className={clsx("whitespace-nowrap px-2 py-2.5 font-semibold", align?.[i] === "r" && "text-right", align?.[i] === "c" && "text-center")}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function SimTag() {
  return <span className="ml-1 rounded bg-amber-50 px-1 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200" title="Simulated: the source dataset has no such data">sim</span>;
}

export function Notice({ tone = "slate", children }: { tone?: "slate" | "green" | "red"; children: React.ReactNode }) {
  return <div className={clsx("rounded-xl px-3 py-2 text-xs ring-1 ring-inset", { "bg-slate-50 text-slate-700 ring-slate-200": tone === "slate", "bg-emerald-50 text-emerald-800 ring-emerald-200": tone === "green", "bg-rose-50 text-rose-800 ring-rose-200": tone === "red" })}>{children}</div>;
}

export function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200/70" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />)}</div>
      <div className="h-72 animate-pulse rounded-2xl bg-slate-200/50" />
    </div>
  );
}
export function ErrorBox({ error }: { error: string }) { return <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>; }
