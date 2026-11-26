"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { useApi, useApp, send } from "@/components/app-context";
import { Card, Table, inr, pct, num, Loading, ErrorBox, SimTag, Button, inputCls, PageHeader, VerdictBadge, Notice, tidy } from "@/components/ui";

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
      <PageHeader eyebrow="Analyse" title="Acquisition campaigns"
        subtitle={<>Brand level funnel for each campaign as of {d.meta.as_of}. We scale a campaign when 30% or more of its brands close. We stop it after 20 brands with no close despite 5 deals, or under 10% meetings after 50 sends. Under 8 brands is too early to call. Anything else, we change.</>} />
      {msg && <Notice tone="green">{msg}</Notice>}
      <Card title="Funnel and verdict by campaign" subtitle="Distinct brands at each step. The small figure under a count is its rate from the step before.">
        <Table head={["Campaign", "Verdict", "Close rate", "Confirmed ₹", "Open pipeline", "Brands", "Replied", "Met", "Qualified", "Deals", "Won", "Lost", "Weakest step", ""]} align={["l", "l", "r", "r", "r", "r", "r", "r", "r", "r", "r", "r", "l", "l"]}>
          {d.campaigns.map((c: any) => (
            <tr key={c.key}>
              <td className="min-w-48 px-2 py-2"><div className="font-semibold text-slate-900">{c.label}</div><div className="whitespace-nowrap text-[11px] text-slate-400">{c.key} · {String(c.channel).replace("_", " ")} · {c.owner}</div></td>
              <td className="min-w-56 px-2 py-2"><VerdictBadge v={c.verdict} /><div className="mt-1 max-w-[260px] text-[11px] leading-snug text-slate-500">{tidy(c.reason)}</div></td>
              <td className="px-2 py-2 text-right font-semibold">{pct(c.close_rate_brand)}</td>
              <td className="px-2 py-2 text-right">{inr(c.confirmed_value_inr)}</td>
              <td className="px-2 py-2 text-right">{inr(c.open_pipeline_inr)}</td>
              <td className="px-2 py-2 text-right">{c.brands_touched}<div className="text-[11px] text-slate-400">{c.attempts} sends</div></td>
              <td className="px-2 py-2 text-right">{c.brands_replied}<div className="text-[11px] text-slate-400">{pct(c.reply_rate_brand)}</div></td>
              <td className="px-2 py-2 text-right">{c.brands_met}<div className="text-[11px] text-slate-400">{pct(c.meeting_rate_brand)}</div></td>
              <td className="px-2 py-2 text-right">{c.qualified_brands}</td>
              <td className="px-2 py-2 text-right">{c.opportunities}</td>
              <td className="px-2 py-2 text-right font-semibold">{c.confirmed}</td>
              <td className="px-2 py-2 text-right">{c.lost_or_withdrawn}</td>
              <td className="min-w-32 px-2 py-2 text-xs">{String(c.weakest_step.step).replace("→", "to")}<div className="text-[11px] text-slate-400">{c.weakest_step.n} of {c.weakest_step.d}</div></td>
              <td className="px-2 py-2"><button onClick={() => ask(`Diagnose the campaign ${c.label}: what is working, where is the bottleneck, and what should we do?`)} className="whitespace-nowrap text-xs font-medium text-brand-600 hover:underline">Ask AI</button></td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={<>Effort and efficiency <SimTag /></>} subtitle="The source data has no spend, so budgets and hours are simulated planning inputs. Edit them and the metrics update.">
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
                <Bar dataKey="met" fill="#8eb2fb" name="Met" />
                <Bar dataKey="qualified" fill="#0053b4" name="Qualified" />
                <Bar dataKey="confirmed" fill="#059669" name="Confirmed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="By owner" subtitle="Load against results. Where is seller time going?">
          <Table head={["Owner", "Brands owned", "Brands touched", "Attempts", "Met", "Opps", "Confirmed", "Confirmed ₹", "Open pipeline", "Open tasks", "Overdue"]}>
            {d.owners.map((o: any) => (
              <tr key={o.key}><td className="px-2 py-1.5 font-medium">{o.label}<span className="ml-1 text-[11px] text-slate-400">{o.key}</span></td><td className="px-2 py-1.5">{o.brands_owned}</td><td className="px-2 py-1.5">{o.brands_touched}</td><td className="px-2 py-1.5">{o.attempts}</td><td className="px-2 py-1.5">{o.brands_met}</td><td className="px-2 py-1.5">{o.opportunities}</td><td className="px-2 py-1.5">{o.confirmed}</td><td className="px-2 py-1.5">{inr(o.confirmed_value_inr)}</td><td className="px-2 py-1.5">{inr(o.open_pipeline_inr)}</td><td className="px-2 py-1.5">{o.open_tasks}</td><td className="px-2 py-1.5">{o.overdue_tasks || ""}</td></tr>
            ))}
          </Table>
          <p className="mt-2 text-[11px] text-slate-400">Interaction counts use the interaction owner; opportunities use the latest opportunity owner; brands owned uses the brand owner.</p>
        </Card>
        <Card title="By industry">
          <Table head={["Industry", "Brands touched", "Met", "Qualified", "Opps", "Confirmed", "Confirmed ₹", "Close rate"]}>
            {d.industries.map((o: any) => (
              <tr key={o.key}><td className="px-2 py-1.5 font-medium">{o.label}</td><td className="px-2 py-1.5">{o.brands_touched}</td><td className="px-2 py-1.5">{o.brands_met}</td><td className="px-2 py-1.5">{o.qualified_brands}</td><td className="px-2 py-1.5">{o.opportunities}</td><td className="px-2 py-1.5">{o.confirmed}</td><td className="px-2 py-1.5">{inr(o.confirmed_value_inr)}</td><td className="px-2 py-1.5">{pct(o.close_rate_brand)}</td></tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}
