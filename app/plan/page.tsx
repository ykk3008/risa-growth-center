"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import model from "@/data/model_output.json";
import { BET_PLANS, GLOBAL_GATES } from "@/lib/plan";
import { useApi, useApp } from "@/components/app-context";
import { Card, Table, lakh, pct, num, Badge, verdictTone } from "@/components/ui";

const fmtRule = (v: number, unit: string) => (unit === "%" ? pct(v) : unit === "lakh" ? `₹${v}L` : unit === "per_week" ? `${v}/wk` : String(v));

export default function Plan() {
  const { ask } = useApp();
  const { data: sig } = useApi<any>("/api/bets");
  const curve = model.cash_curve.base.map((b, i) => ({ week: `W${i + 1}`, base: b, stretch: model.cash_curve.stretch[i] }));
  const seg = model.base.segments.map((s, i) => ({ ...s, st: model.stretch.segments[i] }));
  const mc = model.monte_carlo;
  const up = model.uplift;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{model.fest.name} · {model.fest.city} · {model.fest.dates} — sponsorship plan</h1>
          <p className="text-xs text-slate-500">North star: sponsorship <b>cash in bank by T-14 ({model.fest.t14})</b>, net of 2% TDS. Model projections (2025 dataset rates haircut toward public benchmarks + labelled estimates), not actuals. Source: model/build_model.py → sponsorship_model.xlsx.</p>
        </div>
        <button onClick={() => ask("Using the 2027 plan and the live bet signals, which bet should we double down on this week and why?")} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100">Ask copilot about the plan</button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-xl border bg-white p-4"><div className="text-xs uppercase text-slate-500">Status-quo replay</div><div className="text-2xl font-semibold">{lakh(model.status_quo_cash_by_T14_lakh)}</div><div className="text-xs text-slate-500">2025 cash deals, same cash waterfall, {up.team_2025} sellers</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-xs uppercase text-slate-500">Base case</div><div className="text-2xl font-semibold text-indigo-700">{lakh(model.base.cash_by_T14_lakh)}</div><div className="text-xs text-slate-500">{num(model.base.deals, 0)} deals · 6 sellers at {pct(model.base.utilisation)} load</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-xs uppercase text-slate-500">Uncertainty (base team)</div><div className="text-2xl font-semibold">{lakh(mc.p10)} – {lakh(mc.p90)}</div><div className="text-xs text-slate-500">P10–P90, P50 {lakh(mc.p50)} · Monte Carlo</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-xs uppercase text-slate-500">Stretch</div><div className="text-2xl font-semibold text-emerald-700">{lakh(model.stretch.cash_by_T14_lakh)}</div><div className="text-xs text-slate-500">{num(model.stretch.deals, 0)} deals · 8 sellers at {pct(model.stretch.utilisation)} · higher conversion</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-xs uppercase text-slate-500">Uplift = {up.multiple}×</div><div className="text-sm text-slate-700">{up.deals_ratio}× deals × {up.ticket_ratio}× avg ticket (₹{up.avg_signed_ticket_lakh}L vs ₹0.93L in 2025)</div></div>
      </div>

      <Card title="Live bet signals (plan thresholds applied to live data)" subtitle={sig?.rule ?? "Loading…"}>
        <Table head={["Bet", "Signal", "Proxy", "Metrics vs thresholds", "Action"]}>
          {(sig?.bets ?? []).map((b: any) => (
            <tr key={b.bet} className="align-top text-xs">
              <td className="px-2 py-1.5 font-medium">{b.bet}</td>
              <td className="px-2 py-1.5"><Badge tone={b.signal === "NOT_MEASURABLE" ? "slate" : verdictTone(b.signal)}>{b.signal}</Badge></td>
              <td className="px-2 py-1.5">{b.proxy_campaigns?.join(" + ") ?? "—"}</td>
              <td className="px-2 py-1.5">{b.metrics?.length ? b.metrics.map((m: any) => <div key={m.metric}>{m.metric}: <b>{m.value}</b> (plan {m.plan}, scale ≥ {m.scale_at}, stop &lt; {m.stop_below}, n={m.n}) → {m.signal}</div>) : b.reason}</td>
              <td className="px-2 py-1.5">{b.action ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Segments: deals, signed value and cash (₹ lakh)" subtitle="Funnel per segment × channel, capped by inventory slots; hybrid counts only the guaranteed fee">
          <Table head={["Segment", "Base deals", "Base signed", "Paid by T-14", "Base cash", "Stretch cash"]}>
            {seg.map((s) => (
              <tr key={s.segment}><td className="px-2 py-1.5 text-xs font-medium">{s.segment}</td><td className="px-2 py-1.5">{num(s.deals, 1)}</td><td className="px-2 py-1.5">{lakh(s.signed_value_lakh)}</td><td className="px-2 py-1.5">{pct(s.paid_by_T14)}</td><td className="px-2 py-1.5 font-semibold">{lakh(s.cash_by_T14_lakh)}</td><td className="px-2 py-1.5">{lakh(s.st.cash_by_T14_lakh)}</td></tr>
            ))}
          </Table>
        </Card>
        <Card title="Downside: one change at a time" subtitle={`Monte Carlo: ${mc.method}`}>
          <Table head={["Sensitivity", "Cash by T-14", "vs base"]}>
            {model.sensitivities.map((x) => <tr key={x.case} className="text-xs"><td className="px-2 py-1.5">{x.case}</td><td className="px-2 py-1.5 font-semibold">{lakh(x.cash_lakh)}</td><td className="px-2 py-1.5 text-rose-700">{x.delta_lakh}L</td></tr>)}
          </Table>
          <div className="mt-3 h-40">
            <ResponsiveContainer>
              <LineChart data={curve}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="week" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="base" name="Cumulative cash, base (₹L)" stroke="#4f46e5" strokeWidth={2} dot={false} /><Line dataKey="stretch" name="Stretch" stroke="#059669" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Five bets, ranked by net cash per 100 seller-hours" subtitle="(base cash contribution − test budget) ÷ hours attributed from the same hours ledger as capacity. Cash is already an expected value, so no second probability multiplier; confidence shown separately.">
        <Table head={["#", "Bet", "Base ₹", "Stretch ₹ (uplift)", "Budget", "Hours", "Net ₹/100h", "Confidence", "Owner · timeline", "Budget items"]}>
          {model.bets.map((b) => (
            <tr key={b.key} className="align-top text-xs">
              <td className="px-2 py-2 font-semibold">{b.rank}</td>
              <td className="px-2 py-2 font-medium">{b.bet}<div className="font-normal text-slate-400">{b.evidence}</div></td>
              <td className="px-2 py-2">{lakh(b.cash_lakh)}</td><td className="px-2 py-2">{lakh(b.stretch_cash_lakh)} (+{b.stretch_uplift_lakh})</td>
              <td className="px-2 py-2">{lakh(b.cost_lakh)}</td><td className="px-2 py-2">{b.effort_h}</td><td className="px-2 py-2 font-semibold">{b.ev_per_100h}</td>
              <td className="px-2 py-2"><Badge tone={b.confidence === "High" ? "green" : b.confidence === "Medium" ? "amber" : "red"}>{b.confidence}</Badge></td>
              <td className="px-2 py-2">{b.owner}<div className="text-slate-400">{b.timeline}</div></td>
              <td className="px-2 py-2">{Object.entries(b.cost_items).filter(([, v]) => v !== undefined).map(([k, v]) => `${k} ₹${v}L`).join("; ")}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="How we will know: thresholds and tests per bet" subtitle="SCALE at ≥ 120% of plan, STOP below 70% of plan, otherwise CHANGE (TOO EARLY below minimum n)">
        <Table head={["Bet", "Critical variable · risk", "Leading indicator", "Thresholds", "Actions", "Test (hypothesis · n · read)", "Tracked in · ask copilot"]}>
          {model.bets.map((b) => {
            const p = BET_PLANS[b.key];
            return (
              <tr key={b.key} className="align-top text-xs">
                <td className="px-2 py-2 font-medium">{b.rank}. {b.key}</td>
                <td className="px-2 py-2">{p.critical}<div className="text-slate-400">Risk: {p.risk}</div></td>
                <td className="px-2 py-2">{p.leading}</td>
                <td className="px-2 py-2">{p.rules.map((r) => <div key={r.metric}>{r.metric}: plan {fmtRule(r.plan, r.unit)} · <span className="text-emerald-700">scale ≥ {fmtRule(r.scale, r.unit)}</span> · <span className="text-rose-700">stop &lt; {fmtRule(r.stop, r.unit)}</span> · min n {r.min_n}</div>)}</td>
                <td className="px-2 py-2"><div className="text-emerald-700">Scale: {p.scale_action}</div><div className="text-amber-700">Change: {p.change_action}</div><div className="text-rose-700">Stop: {p.stop_action}</div></td>
                <td className="px-2 py-2">{p.test.hypothesis}<div className="text-slate-500">{p.test.unit} · n {p.test.n_per_arm}/arm · {p.test.metric} · {p.test.mde} · read {p.test.read}</div><div className="text-slate-500">Decision: {p.test.decision}</div></td>
                <td className="px-2 py-2">{p.dashboard}<button onClick={() => ask(p.ask_copilot)} className="mt-1 block text-left font-medium text-indigo-600 hover:underline">“{p.ask_copilot}”</button></td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card title="Global gates on the cash plan" subtitle={`Miss = more than ${Math.round(model.gates.tolerance * 100)}% below plan`}>
        <Table head={["Gate", "Plan", "Miss if", "Action"]}>
          {GLOBAL_GATES.map((g) => <tr key={g.gate} className="text-xs"><td className="px-2 py-1.5 font-semibold">{g.gate}</td><td className="px-2 py-1.5">{g.rule}</td><td className="px-2 py-1.5">{g.miss}</td><td className="px-2 py-1.5">{g.action}</td></tr>)}
        </Table>
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
          <div><Badge tone="red">Deprioritise</Badge> mass cold email (0/91 brands confirmed in 2025), dormant revival (0/20), cold LinkedIn blasts (0/37) — only account-based asks for anchors and verticals.</div>
          <div><Badge tone="slate">Reject</Badge> pure CPA (cash after fest) · CSR pitch (event sponsorship isn&apos;t CSR) · govt/PSU grants (lead time) · multi-fest consortium (next year) · in-kind-only deals.</div>
        </div>
      </Card>
    </div>
  );
}
