"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { Sparkles } from "lucide-react";
import model from "@/data/model_output.json";
import { BET_PLANS, GLOBAL_GATES } from "@/lib/plan";
import { useApi, useApp } from "@/components/app-context";
import { Card, Table, lakh, pct, num, Badge, VerdictBadge, PageHeader, Stat, Button, betLabel, metricLabel, verdictLabel } from "@/components/ui";

const CAMPAIGN_NAME: Record<string, string> = {
  SC01: "Brand Discovery Email", SC02: "Warm Partner Introductions", SC03: "Brand Leader LinkedIn",
  SC04: "Partner Interest Form", SC05: "Creator Network Referrals", SC06: "Past Conversation Revival",
};
const unitOf = (bet: string, metric: string) => BET_PLANS[bet]?.rules.find((r) => r.metric === metric)?.unit ?? "count";
const fmt = (v: number, unit: string) => (unit === "%" ? pct(v) : unit === "lakh" ? `₹${num(v, 1)}L` : unit === "per_week" ? `${num(v, 1)} a week` : num(v, 1));
const fmtRule = fmt;

export default function Plan() {
  const { ask } = useApp();
  const { data: sig } = useApi<any>("/api/bets");
  const curve = model.cash_curve.base.map((b, i) => ({ week: i === 11 ? "T-14" : `W${i + 1}`, base: b, stretch: model.cash_curve.stretch[i] }));
  const seg = model.base.segments.map((s, i) => ({ ...s, st: model.stretch.segments[i] }));
  const mc = model.monte_carlo;
  const up = model.uplift;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Plan" title={`${model.fest.name}, ${model.fest.city}, ${model.fest.dates}`}
        subtitle={<>The goal is sponsorship <b className="text-slate-700">cash in the bank by T minus 14 ({model.fest.t14})</b>, after 2% TDS. These are model projections built from 2025 conversion rates, trimmed toward public benchmarks. They are not actuals.</>}
        actions={<Button variant="soft" onClick={() => ask("Using the 2027 plan and the live bet signals, which bet should we double down on this week and why?")}><Sparkles size={14} /> Ask the copilot about the plan</Button>} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="If we repeat 2025" value={lakh(model.status_quo_cash_by_T14_lakh)} sub={`Same deals and payment terms, ${up.team_2025} sellers`} />
        <Stat label="Base case" value={<span className="text-brand-700">{lakh(model.base.cash_by_T14_lakh)}</span>} sub={`${num(model.base.deals, 0)} deals, 6 sellers at ${pct(model.base.utilisation)} load. ${up.multiple}x the 2025 replay`} progress={model.base.cash_by_T14_lakh / model.stretch.cash_by_T14_lakh} />
        <Stat label="Likely range" value={`${lakh(mc.p10)} to ${lakh(mc.p90)}`} sub={`10th to 90th percentile, middle ${lakh(mc.p50)}`} />
        <Stat label="Stretch" value={lakh(model.stretch.cash_by_T14_lakh)} tone="good" sub={`${num(model.stretch.deals, 0)} deals, 8 sellers, better conversion`} />
      </div>

      <Card title="Live bet signals" subtitle="Each bet's plan thresholds applied to the live data. A bet scales when every metric is at least 120% of plan, stops when any metric is under 70%, and changes in between. Small samples show as too early.">
        {!sig ? <div className="h-48 animate-pulse rounded-xl bg-slate-100" /> : <Table head={["Bet", "Signal", "Measured on", "Metrics against plan", "What we do"]}>
          {(sig?.bets ?? []).map((b: any) => (
            <tr key={b.bet} className="text-[13px]">
              <td className="w-44 px-2 font-semibold text-slate-900">{betLabel(b.bet)}</td>
              <td className="w-32 px-2"><VerdictBadge v={b.signal} /></td>
              <td className="w-48 px-2 text-xs text-slate-600">{b.proxy_campaigns?.length ? b.proxy_campaigns.map((c: string) => <div key={c}>{CAMPAIGN_NAME[c] ?? c} <span className="text-slate-400">{c}</span></div>) : <span className="text-slate-400">Not tagged yet</span>}</td>
              <td className="min-w-[420px] px-2">
                {b.metrics?.length ? (
                  <div className="space-y-2">
                    {b.metrics.map((m: any) => {
                      const u = unitOf(b.bet, m.metric);
                      return (
                        <div key={m.metric} className="rounded-lg bg-slate-50 px-2.5 py-1.5 ring-1 ring-slate-100">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-700">{metricLabel(m.metric)}</span>
                            <span className="ml-auto whitespace-nowrap font-semibold tabular-nums text-slate-900">{fmt(m.value, u)}</span>
                            <span className="whitespace-nowrap text-xs text-slate-500">plan {fmt(m.plan, u)}</span>
                            <Badge tone={m.signal === "SCALE" ? "green" : m.signal === "STOP" ? "red" : m.signal === "CHANGE" ? "amber" : "slate"}>{verdictLabel(m.signal)}</Badge>
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">Scale at {fmt(m.scale_at, u)}, stop under {fmt(m.stop_below, u)}, based on {m.n} brands</div>
                        </div>
                      );
                    })}
                  </div>
                ) : <span className="text-xs text-slate-500">No 2025 deals map to this bet, so it becomes measurable once its 2027 deals are tagged.</span>}
              </td>
              <td className="w-64 px-2 text-xs text-slate-700">{b.action && b.signal !== "NOT_MEASURABLE" ? b.action : <span className="text-slate-400">Wait for tagged deals</span>}</td>
            </tr>
          ))}
        </Table>}
      </Card>

      <div className="grid gap-5 2xl:grid-cols-2">
        <Card title="Segments, deals and cash" subtitle="Funnel per segment and channel, capped by sponsor slots. Hybrid deals count only the guaranteed fee.">
          <Table head={["Segment", "Deals", "Signed", "Paid by T-14", "Base cash", "Stretch cash"]} align={["l", "r", "r", "r", "r", "r"]}>
            {seg.map((s) => (
              <tr key={s.segment}><td className="min-w-64 px-2 text-[13px] font-medium">{s.segment}</td><td className="px-2 text-right">{num(s.deals, 1)}</td><td className="px-2 text-right">{lakh(s.signed_value_lakh)}</td><td className="px-2 text-right">{pct(s.paid_by_T14)}</td><td className="px-2 text-right font-semibold text-navy">{lakh(s.cash_by_T14_lakh)}</td><td className="px-2 text-right">{lakh(s.st.cash_by_T14_lakh)}</td></tr>
            ))}
          </Table>
        </Card>
        <Card title="What could go wrong" subtitle="One change at a time, against the base case. The cash curve shows when money lands.">
          <Table head={["If this happens", "Cash by T-14", "Change"]} align={["l", "r", "r"]}>
            {model.sensitivities.map((x) => <tr key={x.case} className="text-[13px]"><td className="px-2">{x.case}</td><td className="px-2 text-right font-semibold">{lakh(x.cash_lakh)}</td><td className="px-2 text-right text-rose-700">{x.delta_lakh}L</td></tr>)}
          </Table>
          <div className="mt-4 h-44">
            <ResponsiveContainer>
              <LineChart data={curve} margin={{ left: -10, right: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="week" tick={{ fontSize: 11, fill: "#64748b" }} /><YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit="L" /><Tooltip formatter={(v) => `₹${v}L`} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="base" name="Cash in bank, base" stroke="#0053b4" strokeWidth={2.5} dot={false} /><Line dataKey="stretch" name="Stretch" stroke="#059669" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Five bets, ranked by cash per 100 seller hours" subtitle="Base cash minus test budget, divided by the seller hours each bet uses. Confidence is shown separately.">
        <Table head={["#", "Bet", "Base cash", "Stretch", "Budget", "Hours", "Cash per 100 h", "Confidence", "Owner and timing"]} align={["l", "l", "r", "r", "r", "r", "r", "l", "l"]}>
          {model.bets.map((b) => (
            <tr key={b.key} className="text-[13px]">
              <td className="px-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-navy text-[11px] font-semibold text-white">{b.rank}</span></td>
              <td className="max-w-md px-2"><div className="font-semibold text-slate-900">{betLabel(b.key)}</div><div className="text-xs text-slate-500">{b.evidence}</div></td>
              <td className="px-2 text-right font-semibold">{lakh(b.cash_lakh)}</td><td className="px-2 text-right">{lakh(b.stretch_cash_lakh)}</td>
              <td className="px-2 text-right">{lakh(b.cost_lakh)}</td><td className="px-2 text-right">{b.effort_h}</td>
              <td className={`px-2 text-right font-semibold ${b.ev_per_100h < 0 ? "text-rose-700" : "text-navy"}`}>{lakh(b.ev_per_100h).replace("₹-", "−₹")}</td>
              <td className="px-2"><Badge tone={b.confidence === "High" ? "green" : b.confidence === "Medium" ? "amber" : "red"} dot>{b.confidence}</Badge></td>
              <td className="px-2 text-xs">{b.owner}<div className="text-slate-500">{b.timeline}</div></td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="How we will know, bet by bet" subtitle="Plan numbers, scale and stop lines, and the test we run for each bet">
        <Table head={["Bet", "What decides it", "Thresholds", "What we do", "Test", "Ask the copilot"]}>
          {model.bets.map((b) => {
            const p = BET_PLANS[b.key];
            return (
              <tr key={b.key} className="text-xs">
                <td className="w-44 px-2 text-[13px] font-semibold text-slate-900">{betLabel(b.key)}</td>
                <td className="px-2">{p.critical}<div className="mt-0.5 text-rose-700">Risk: {p.risk}</div></td>
                <td className="px-2">{p.rules.map((r) => <div key={r.metric} className="mb-1"><span className="text-slate-700">{metricLabel(r.metric)}</span>: plan {fmtRule(r.plan, r.unit)}<div className="text-[11px]"><span className="text-emerald-700">scale at {fmtRule(r.scale, r.unit)}</span> · <span className="text-rose-700">stop under {fmtRule(r.stop, r.unit)}</span></div></div>)}</td>
                <td className="px-2"><div className="text-emerald-700">Scale: {p.scale_action}</div><div className="text-amber-700">Change: {p.change_action}</div><div className="text-rose-700">Stop: {p.stop_action}</div></td>
                <td className="px-2">{p.test.hypothesis}<div className="text-slate-500">{p.test.n_per_arm} per arm, read in {p.test.read.toLowerCase()}</div></td>
                <td className="w-56 px-2"><button onClick={() => ask(p.ask_copilot)} className="text-left font-medium text-brand-600 hover:underline">“{p.ask_copilot}”</button></td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card title="Checkpoints on the cash plan" subtitle={`We act when we fall more than ${Math.round(model.gates.tolerance * 100)}% behind plan`}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {GLOBAL_GATES.map((g, i) => (
            <div key={g.gate} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-navy text-[10px] font-semibold text-white">{i + 1}</span><span className="text-[13px] font-semibold text-brand-700">{g.gate}</span></div>
              <div className="mt-2 text-[13px] font-semibold text-slate-900">{g.rule}</div>
              <div className="mt-1 text-xs text-rose-700">Behind if {g.miss}</div>
              <div className="mt-1 text-xs text-slate-600">{g.action}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
          <div className="rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200"><b>Cut back.</b> Mass cold email closed 0 of 91 brands in 2025, revival 0 of 20, cold LinkedIn 0 of 37. Cold outreach stays only for anchor and vertical asks.</div>
          <div className="rounded-xl bg-rose-50 p-3 text-rose-900 ring-1 ring-rose-200"><b>Say no to.</b> Pure CPA deals (cash lands after the fest), CSR pitches (event sponsorship is not CSR), government grants (too slow), a multi fest consortium (next year) and in kind only deals.</div>
        </div>
      </Card>
    </div>
  );
}
