"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, BarChart, Bar } from "recharts";
import { AlertTriangle, TrendingUp, Sparkles } from "lucide-react";
import { useApi, useApp } from "@/components/app-context";
import { Card, Stat, Badge, inr, pct, num, Loading, ErrorBox, SimTag, verdictTone, lakh } from "@/components/ui";

export default function Overview() {
  const { data: d, error, loading } = useApi<any>("/api/dashboard");
  const { ask } = useApp();
  if (error) return <ErrorBox error={error} />;
  if (loading && !d) return <Loading />;
  if (!d) return null;
  const k = d.kpis;
  const confTone = k.confirmed_attainment >= 1 ? "good" : k.confirmed_partnerships >= k.pacing.expected_confirmed_by_now_linear ? "default" : "warn";
  const funnel = [
    { step: "Brands contacted", v: k.brands_contacted },
    { step: "Brands replied", v: k.brands_replied },
    { step: "Brands met", v: k.brands_met },
    { step: "Qualified", v: k.qualified_brands },
    { step: "Opportunities", v: k.opportunities_total },
    { step: "Confirmed", v: k.confirmed_partnerships },
  ];
  const alerts: { tone: "red" | "amber" | "green"; text: string; q: string }[] = [];
  for (const c of d.campaigns) {
    if (c.verdict === "STOP") alerts.push({ tone: "red", text: `STOP · ${c.label}: ${c.reason}`, q: `Should we stop ${c.label}? Show the evidence and where to move the effort.` });
    if (c.verdict === "SCALE") alerts.push({ tone: "green", text: `SCALE · ${c.label}: ${c.reason}`, q: `How do we scale ${c.label}? What capacity would it need?` });
  }
  if (d.bottlenecks.stalled_open_opportunities.count) alerts.push({ tone: "amber", text: `${d.bottlenecks.stalled_open_opportunities.count} open deals stalled >14 days (${inr(d.bottlenecks.stalled_open_opportunities.value_inr)} proposed).`, q: "Which stalled deals should we push, re-price or drop? Draft tasks for the owners." });
  if (d.cash.totals.overdue_count) alerts.push({ tone: "amber", text: `${d.cash.totals.overdue_count} sponsor payments overdue (${inr(d.cash.totals.overdue_gross_inr)}, simulated).`, q: "Which sponsor payments are overdue and who should chase them?" });
  const overdueTasks = d.tasks.filter((t: any) => t.overdue).length;
  if (overdueTasks) alerts.push({ tone: "amber", text: `${overdueTasks} team tasks overdue.`, q: "Which tasks are overdue and what is blocking them?" });
  if (k.forecast.gap_to_target > 0) alerts.push({ tone: "red", text: `Forecast ${num(k.forecast.projected_confirmed, 1)} confirmed vs goal ${k.targets.confirmed_partnerships_goal} — gap ${num(k.forecast.gap_to_target, 1)}.`, q: "Why are we behind the confirmed-partnership target, and what should we do this week?" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Sponsorship overview</h1>
          <p className="text-xs text-slate-500">{d.meta.event.event_name} · as of {d.meta.as_of} · targets: {k.target_version} · {pct(k.pacing.share_of_campaign_elapsed)} of the campaign window elapsed</p>
        </div>
        <button onClick={() => ask("Give me a 5-line status briefing for the sponsorship team with the biggest risk and the top 3 actions.")} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"><Sparkles size={14} /> AI briefing</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Confirmed partnerships" value={`${k.confirmed_partnerships} / ${k.targets.confirmed_partnerships_goal}`} tone={confTone} sub={`${pct(k.confirmed_attainment)} of goal · linear pace ${num(k.pacing.expected_confirmed_by_now_linear, 1)}`} />
        <Stat label="Qualified brands" value={`${k.qualified_brands} / ${k.targets.qualified_brands_goal}`} tone={k.qualified_attainment >= 1 ? "good" : "default"} sub={`${pct(k.qualified_attainment)} of goal`} />
        <Stat label="Confirmed value" value={inr(k.confirmed_value_inr)} sub={<>cash-type {inr(k.confirmed_cash_type_value_inr)} · in-kind {inr(k.confirmed_in_kind_value_inr)} · not cash collected</>} />
        <Stat label="Open pipeline" value={inr(k.open_pipeline_proposed_inr)} sub={`${k.open_opportunities} open deals · ${d.bottlenecks.stalled_open_opportunities.count} stalled >14d`} tone={d.bottlenecks.stalled_open_opportunities.count ? "warn" : "default"} />
        <Stat label="Forecast confirmed" value={num(k.forecast.projected_confirmed, 1)} sub={`proj. value ${inr(k.forecast.projected_value_inr)}${d.forecast.event_started ? " · event started" : ""}`} tone={k.forecast.gap_to_target > 0 ? "bad" : "good"} hint={d.forecast.method} />
        <Stat label="Cash received (net)" value={<>{inr(d.cash.totals.received_net_inr)}<SimTag /></>} sub={`outstanding ${inr(d.cash.totals.outstanding_gross_inr)} · by T-14 ${inr(d.cash.totals.received_net_by_T14_inr)}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Progress vs goal (weekly, point-in-time)" subtitle="Each point is a snapshot at that date — no later outcomes leak in." className="xl:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={d.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(x) => x.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="confirmed" name="Confirmed" stroke="#4f46e5" strokeWidth={2} dot={false} />
                <Line type="stepAfter" dataKey="goal_confirmed" name="Confirmed goal" stroke="#4f46e5" strokeDasharray="5 4" dot={false} />
                <Line type="monotone" dataKey="qualified" name="Qualified" stroke="#059669" strokeWidth={2} dot={false} />
                <Line type="stepAfter" dataKey="goal_qualified" name="Qualified goal" stroke="#059669" strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="What needs attention" subtitle="Rules: scale/change/stop thresholds, stall >14d, overdue items">
          <ul className="space-y-2">
            {alerts.length === 0 && <li className="text-sm text-slate-500">Nothing flagged.</li>}
            {alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                {a.tone === "green" ? <TrendingUp size={14} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${a.tone === "red" ? "text-rose-600" : "text-amber-600"}`} />}
                <div className="flex-1">{a.text} <button onClick={() => ask(a.q)} className="ml-1 font-medium text-indigo-600 hover:underline">Ask copilot →</button></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Brand funnel (distinct brands)" subtitle="Attempts ≠ contacts ≠ brands ≠ qualified ≠ confirmed">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={funnel} layout="vertical" margin={{ left: 30 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="step" tick={{ fontSize: 10 }} width={95} />
                <Tooltip />
                <Bar dataKey="v" name="Count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Warm/inbound vs cold outbound" subtitle="Where confirmed value actually comes from">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={d.channel_groups.map((g: any) => ({ name: g.label, brands: g.brands_touched, met: g.brands_met, confirmed: g.confirmed }))}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="brands" name="Brands touched" fill="#cbd5e1" />
                <Bar dataKey="met" name="Brands met" fill="#818cf8" />
                <Bar dataKey="confirmed" name="Confirmed" fill="#059669" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 text-xs text-slate-600">{d.channel_groups.map((g: any) => `${g.label}: ${inr(g.confirmed_value_inr)} confirmed, ${pct(g.close_rate_brand)} brand→confirmed`).join(" · ")}</div>
        </Card>
        <Card title="Campaign verdicts" subtitle="Scale / change / stop (rules on the Campaigns page)">
          <ul className="space-y-1.5 text-xs">
            {d.campaigns.map((c: any) => (
              <li key={c.key} className="flex items-center justify-between gap-2">
                <span className="truncate">{c.label}</span>
                <span className="flex shrink-0 items-center gap-2"><span className="text-slate-500">{c.confirmed} conf · {inr(c.confirmed_value_inr)}</span><Badge tone={verdictTone(c.verdict)}>{c.verdict}</Badge></span>
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
            2027 plan (model): base {lakh(d.model.base.cash)} / stretch {lakh(d.model.stretch.cash)} cash by T-14 vs status-quo replay {lakh(d.model.status_quo_cash)}. See <a href="/plan" className="text-indigo-600 underline">2027 Plan</a>.
          </div>
        </Card>
      </div>
      <p className="text-[11px] text-slate-400">Data quality: removed duplicate import-retry rows — interactions {k.data_quality.duplicate_rows_removed.interactions}, qualification {k.data_quality.duplicate_rows_removed.qualification}, opportunity history {k.data_quality.duplicate_rows_removed.opp_history}. Store: {d.meta.store}.</p>
    </div>
  );
}
