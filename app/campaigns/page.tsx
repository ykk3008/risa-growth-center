"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { useApi, useApp, send } from "@/components/app-context";
import { Card, Badge, Table, inr, pct, num, Loading, ErrorBox, SimTag, verdictTone, Button, inputCls } from "@/components/ui";

export default function Campaigns() {
  const { data: d, error, loading } = useApi<any>("/api/dashboard");
  const { refresh, ask } = useApp();
  const [edit, setEdit] = useState<Record<string, { budget_inr: string; planned_hours: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  if (error) return <ErrorBox error={error} />;
  if (loading && !d) return <Loading />;
  if (!d) return null;

  async function save(id: string) {
    try {
      await send(`/api/campaign-plan/${id}`, "PATCH", { budget_inr: Number(edit[id].budget_inr), planned_hours: Number(edit[id].planned_hours) });
      setEdit((e) => { const n = { ...e }; delete n[id]; return n; });
      setMsg(`Saved plan for ${id}. Efficiency metrics recalculated.`); refresh();
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Acquisition campaigns</h1>
        <p className="text-xs text-slate-500">Brand-level funnel per campaign as of {d.meta.as_of}. Rules — SCALE: brand→confirmed ≥ 30% · STOP: ≥ 20 brands & 0 confirmed with ≥ 5 opps, or meeting rate &lt; 10% after ≥ 50 sends · TOO EARLY: &lt; 8 brands · otherwise CHANGE.</p>
      </div>
      {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{msg}</div>}
      <Card title="Funnel & verdict by campaign">
        <Table head={["Campaign", "Owner", "Brands", "Attempts", "Replied", "Met", "Qualified", "Opps", "Confirmed", "Lost", "Confirmed ₹", "Open pipeline", "Brand→conf.", "Weakest step", "Verdict", ""]}>
          {d.campaigns.map((c: any) => (
            <tr key={c.key} className="align-top">
              <td className="px-2 py-2 font-medium">{c.label}<div className="text-[11px] font-normal text-slate-400">{c.key} · {c.channel}</div></td>
              <td className="px-2 py-2 text-xs">{c.owner}</td>
              <td className="px-2 py-2">{c.brands_touched}</td>
              <td className="px-2 py-2">{c.attempts}</td>
              <td className="px-2 py-2">{c.brands_replied}<div className="text-[11px] text-slate-400">{pct(c.reply_rate_brand)}</div></td>
              <td className="px-2 py-2">{c.brands_met}<div className="text-[11px] text-slate-400">{pct(c.meeting_rate_brand)}</div></td>
              <td className="px-2 py-2">{c.qualified_brands}</td>
              <td className="px-2 py-2">{c.opportunities}</td>
              <td className="px-2 py-2 font-semibold">{c.confirmed}</td>
              <td className="px-2 py-2">{c.lost_or_withdrawn}</td>
              <td className="px-2 py-2">{inr(c.confirmed_value_inr)}</td>
              <td className="px-2 py-2">{inr(c.open_pipeline_inr)}</td>
              <td className="px-2 py-2">{pct(c.close_rate_brand)}</td>
              <td className="px-2 py-2 text-xs">{c.weakest_step.step}<div className="text-[11px] text-slate-400">{c.weakest_step.n}/{c.weakest_step.d}</div></td>
              <td className="px-2 py-2"><Badge tone={verdictTone(c.verdict)}>{c.verdict}</Badge><div className="mt-1 max-w-[220px] text-[11px] text-slate-500">{c.reason}</div></td>
              <td className="px-2 py-2"><button onClick={() => ask(`Diagnose the campaign ${c.label}: what is working, where is the bottleneck, and what should we do?`)} className="text-xs font-medium text-indigo-600 hover:underline">Ask AI</button></td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={<>Effort & efficiency <SimTag /></>} subtitle="The source dataset has no spend data. Budgets/hours are simulated planning inputs — edit them and the metrics update.">
          <Table head={["Campaign", "Budget ₹", "Hours", "₹ / meeting", "₹ / confirmed", "Confirmed ₹ per hour", ""]}>
            {d.campaigns.map((c: any) => {
              const e = edit[c.key];
              return (
                <tr key={c.key}>
                  <td className="px-2 py-1.5 text-xs font-medium">{c.label}</td>
                  <td className="px-2 py-1.5">{e ? <input className={inputCls + " w-24"} value={e.budget_inr} onChange={(x) => setEdit({ ...edit, [c.key]: { ...e, budget_inr: x.target.value } })} /> : inr(c.simulated_budget_inr)}</td>
                  <td className="px-2 py-1.5">{e ? <input className={inputCls + " w-16"} value={e.planned_hours} onChange={(x) => setEdit({ ...edit, [c.key]: { ...e, planned_hours: x.target.value } })} /> : num(c.simulated_hours)}</td>
                  <td className="px-2 py-1.5">{inr(c.simulated_cost_per_meeting_inr)}</td>
                  <td className="px-2 py-1.5">{c.simulated_cost_per_confirmed_inr ? inr(c.simulated_cost_per_confirmed_inr) : <span className="text-rose-600">no closes</span>}</td>
                  <td className="px-2 py-1.5">{inr(c.confirmed_value_per_hour_inr)}</td>
                  <td className="px-2 py-1.5">{e ? <Button onClick={() => save(c.key)}>Save</Button> : <Button variant="ghost" onClick={() => setEdit({ ...edit, [c.key]: { budget_inr: String(c.simulated_budget_inr ?? 0), planned_hours: String(c.simulated_hours ?? 0) } })}>Edit</Button>}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <Card title="Funnel shape by campaign" subtitle="Distinct brands at each step">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={d.campaigns.map((c: any) => ({ name: c.label.replace(/ (Email|LinkedIn|Introductions|Referrals|Form|Revival)$/, ""), touched: c.brands_touched, met: c.brands_met, qualified: c.qualified_brands, confirmed: c.confirmed }))}>
                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="touched" fill="#cbd5e1" name="Touched" />
                <Bar dataKey="met" fill="#a5b4fc" name="Met" />
                <Bar dataKey="qualified" fill="#6366f1" name="Qualified" />
                <Bar dataKey="confirmed" fill="#059669" name="Confirmed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="By owner" subtitle="Load vs results — where is seller time going?">
          <Table head={["Owner", "Brands owned", "Brands touched", "Attempts", "Met", "Opps", "Confirmed", "Confirmed ₹", "Open pipeline", "Open tasks", "Overdue"]}>
            {d.owners.map((o: any) => (
              <tr key={o.key}><td className="px-2 py-1.5 font-medium">{o.label}<span className="ml-1 text-[11px] text-slate-400">{o.key}</span></td><td className="px-2 py-1.5">{o.brands_owned}</td><td className="px-2 py-1.5">{o.brands_touched}</td><td className="px-2 py-1.5">{o.attempts}</td><td className="px-2 py-1.5">{o.brands_met}</td><td className="px-2 py-1.5">{o.opportunities}</td><td className="px-2 py-1.5">{o.confirmed}</td><td className="px-2 py-1.5">{inr(o.confirmed_value_inr)}</td><td className="px-2 py-1.5">{inr(o.open_pipeline_inr)}</td><td className="px-2 py-1.5">{o.open_tasks}</td><td className="px-2 py-1.5">{o.overdue_tasks || ""}</td></tr>
            ))}
          </Table>
          <p className="mt-2 text-[11px] text-slate-400">Interaction counts use the interaction owner; opportunities use the latest opportunity owner; brands owned uses the brand owner.</p>
        </Card>
        <Card title="By industry">
          <Table head={["Industry", "Brands touched", "Met", "Qualified", "Opps", "Confirmed", "Confirmed ₹", "Brand→conf."]}>
            {d.industries.map((o: any) => (
              <tr key={o.key}><td className="px-2 py-1.5 font-medium">{o.label}</td><td className="px-2 py-1.5">{o.brands_touched}</td><td className="px-2 py-1.5">{o.brands_met}</td><td className="px-2 py-1.5">{o.qualified_brands}</td><td className="px-2 py-1.5">{o.opportunities}</td><td className="px-2 py-1.5">{o.confirmed}</td><td className="px-2 py-1.5">{inr(o.confirmed_value_inr)}</td><td className="px-2 py-1.5">{pct(o.close_rate_brand)}</td></tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}
