"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useApi, useApp, send } from "@/components/app-context";
import { Card, Badge, inr, pct, num, Loading, ErrorBox, Button, Field, inputCls, stageTone } from "@/components/ui";

const COLS = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"];

export default function Pipeline() {
  const { asOf, refresh, ask } = useApp();
  const { data: d, error, loading } = useApi<any>("/api/opportunities");
  const [campaign, setCampaign] = useState("");
  const [owner, setOwner] = useState("");
  const [sel, setSel] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const opps = useMemo(() => (d?.opportunities ?? []).filter((o: any) => (!campaign || o.campaign === campaign) && (!owner || o.owner === owner)), [d, campaign, owner]);
  if (error) return <ErrorBox error={error} />;
  if (loading && !d) return <Loading />;
  if (!d) return null;
  const campaigns = [...new Set<string>(d.opportunities.map((o: any) => o.campaign))].sort();
  const owners = [...new Set<string>(d.opportunities.map((o: any) => o.owner))].sort();

  function open(o: any) {
    setSel(o); setMsg(null);
    setForm({ stage: o.stage, effective_date: asOf, proposed_value_inr: o.proposed_value_inr, confirmed_value_inr: o.confirmed_value_inr || o.proposed_value_inr, note: "" });
  }
  async function save() {
    try {
      const r = await send(`/api/opportunities/${sel.opportunity_id}`, "POST", { ...form, confirmed_value_inr: form.stage === "partner_confirmed" ? form.confirmed_value_inr : undefined });
      setMsg({ ok: true, text: `Saved new version ${r.version.history_id} (${r.previous_stage} → ${r.version.stage}).${r.warning ? " " + r.warning : ""}` });
      setSel(null); refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Opportunity pipeline</h1>
          <p className="text-xs text-slate-500">Latest stage per opportunity as of {d.as_of}. Edits append a new full-state version (history is never overwritten). Forecast: {num(d.forecast.projected_confirmed, 1)} confirmed, {inr(d.forecast.projected_value_inr)}.</p>
        </div>
        <div className="flex gap-2">
          <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={inputCls}><option value="">All campaigns</option>{campaigns.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls}><option value="">All owners</option>{owners.map((c) => <option key={c}>{c}</option>)}</select>
          <Button variant="secondary" onClick={() => ask("Which open deals should we push, re-price or drop this week? Use the forecast weights and days in stage.")}>Ask AI</Button>
        </div>
      </div>
      {msg && <div className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</div>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {COLS.map((st) => {
          const items = opps.filter((o: any) => o.stage === st);
          return (
            <div key={st} className="flex min-h-40 flex-col rounded-xl bg-slate-100 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <Badge tone={stageTone(st)}>{st.replace("_", " ")}</Badge>
                <span className="text-[11px] text-slate-500">{items.length} · {inr(items.reduce((a: number, o: any) => a + (st === "partner_confirmed" ? o.confirmed_value_inr : o.proposed_value_inr), 0))}</span>
              </div>
              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: "65vh" }}>
                {items.map((o: any) => (
                  <button key={o.opportunity_id} onClick={() => open(o)} className="block w-full rounded-lg bg-white p-2 text-left text-xs shadow-sm ring-1 ring-slate-200 hover:ring-indigo-400">
                    <div className="font-medium text-slate-800">{o.brand}</div>
                    <div className="text-slate-500">{o.campaign}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="font-semibold">{inr(st === "partner_confirmed" ? o.confirmed_value_inr : o.proposed_value_inr)}</span>
                      {o.support_type === "in_kind" && <Badge tone="amber">in-kind</Badge>}
                    </div>
                    <div className="mt-0.5 flex justify-between text-[10px] text-slate-400">
                      <span>{o.owner} · {o.days_in_stage}d</span>
                      {o.forecast_weight !== null && <span title="Forecast weight">p={pct(o.forecast_weight)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {sel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={() => setSel(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <Card title={`${sel.brand} — ${sel.opportunity_id}`} subtitle={`${sel.campaign} · ${sel.support_type} · owner ${sel.owner} · current: ${sel.stage}`} className="border-0 p-0 shadow-none">
              <div className="grid grid-cols-2 gap-3">
                <Field label="New stage"><select className={inputCls} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>{COLS.map((c) => <option key={c}>{c}</option>)}</select></Field>
                <Field label="Effective date"><input type="date" className={inputCls} value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} /></Field>
                <Field label="Proposed value ₹"><input type="number" className={inputCls} value={form.proposed_value_inr} onChange={(e) => setForm({ ...form, proposed_value_inr: e.target.value })} /></Field>
                {form.stage === "partner_confirmed" && <Field label="Confirmed value ₹"><input type="number" className={inputCls} value={form.confirmed_value_inr} onChange={(e) => setForm({ ...form, confirmed_value_inr: e.target.value })} /></Field>}
                <div className="col-span-2"><Field label="Note"><input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="why the change" /></Field></div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">The change is visible in snapshots on/after the effective date (18:00 IST). Defaults to the current as-of date so the dashboard updates immediately.</p>
              <div className="mt-3 flex justify-end gap-2"><Button variant="secondary" onClick={() => setSel(null)}>Cancel</Button><Button onClick={save}>Save version</Button></div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
