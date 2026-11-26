"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import clsx from "clsx";
import { Sparkles, Clock, Filter } from "lucide-react";
import { useApi, useApp, send } from "@/components/app-context";
import { Card, Badge, inr, pct, num, Loading, ErrorBox, Button, Field, inputCls, selectCls, PageHeader, Stat, Notice, stageLabel, STAGE_LABEL } from "@/components/ui";

const COLS = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"];
const OPEN = new Set(["prospecting", "contacted", "proposal_sent", "negotiating"]);
const STALL_DAYS = 14;
const COL_STYLE: Record<string, { dot: string; head: string }> = {
  prospecting: { dot: "bg-slate-400", head: "text-slate-700" },
  contacted: { dot: "bg-sky-500", head: "text-sky-800" },
  proposal_sent: { dot: "bg-brand-600", head: "text-brand-700" },
  negotiating: { dot: "bg-violet-500", head: "text-violet-800" },
  partner_confirmed: { dot: "bg-emerald-500", head: "text-emerald-800" },
  lost: { dot: "bg-rose-500", head: "text-rose-800" },
  withdrawn: { dot: "bg-rose-300", head: "text-rose-700" },
};

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
  const open = opps.filter((o: any) => OPEN.has(o.stage));
  const stalled = open.filter((o: any) => o.days_in_stage > STALL_DAYS);
  const confirmed = opps.filter((o: any) => o.stage === "partner_confirmed");

  function openEdit(o: any) {
    setSel(o); setMsg(null);
    setForm({ stage: o.stage, effective_date: asOf, proposed_value_inr: o.proposed_value_inr, confirmed_value_inr: o.confirmed_value_inr || o.proposed_value_inr, note: "" });
  }
  async function save() {
    try {
      const r = await send(`/api/opportunities/${sel.opportunity_id}`, "POST", { ...form, confirmed_value_inr: form.stage === "partner_confirmed" ? form.confirmed_value_inr : undefined });
      setMsg({ ok: true, text: `Saved. ${sel.brand} moved from ${stageLabel(r.previous_stage)} to ${stageLabel(r.version.stage)} (version ${r.version.history_id}).${r.warning ? " " + r.warning : ""}` });
      setSel(null); refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Act" title="Opportunity pipeline"
        subtitle={<>Every deal at its latest stage as of {d.as_of}. Click a card to move it. Each edit is saved as a new version, so history is never overwritten.</>}
        actions={<Button variant="soft" onClick={() => ask("Which open deals should we push, re-price or drop this week? Use the forecast weights and days in stage.")}><Sparkles size={14} /> Ask the copilot what to push</Button>} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Open deals" value={open.length} sub={`${inr(open.reduce((a: number, o: any) => a + o.proposed_value_inr, 0))} proposed`} />
        <Stat label="Stalled over 14 days" value={stalled.length} tone={stalled.length ? "warn" : "default"} sub={`${inr(stalled.reduce((a: number, o: any) => a + o.proposed_value_inr, 0))} sitting idle`} />
        <Stat label="Confirmed" value={confirmed.length} tone="good" sub={`${inr(confirmed.reduce((a: number, o: any) => a + o.confirmed_value_inr, 0))} confirmed value`} />
        <Stat label="Forecast confirmed" value={num(d.forecast.projected_confirmed, 1)} sub={`${inr(d.forecast.projected_value_inr)} expected value`} hint={d.forecast.method} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <Filter size={14} className="text-slate-400" />
        <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className={selectCls}><option value="">All campaigns</option>{campaigns.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className={selectCls}><option value="">All owners</option>{owners.map((c) => <option key={c}>{c}</option>)}</select>
        {(campaign || owner) && <Button variant="ghost" size="sm" onClick={() => { setCampaign(""); setOwner(""); }}>Clear</Button>}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500"><span className="h-3 w-1 rounded bg-amber-400" /> Amber edge means no stage change for over {STALL_DAYS} days</span>
      </div>

      {msg && <Notice tone={msg.ok ? "green" : "red"}>{msg.text}</Notice>}

      <div className="-mx-1 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3 px-1">
          {COLS.map((st) => {
            const items = opps.filter((o: any) => o.stage === st).sort((a: any, b: any) => b.days_in_stage - a.days_in_stage);
            const total = items.reduce((a: number, o: any) => a + (st === "partner_confirmed" ? o.confirmed_value_inr : o.proposed_value_inr), 0);
            const cs = COL_STYLE[st];
            return (
              <div key={st} className="flex w-61 shrink-0 flex-col rounded-2xl bg-slate-100/80 p-2 ring-1 ring-inset ring-slate-200/70">
                <div className="mb-2 flex items-center justify-between gap-2 px-1.5 pt-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={clsx("h-2 w-2 shrink-0 rounded-full", cs.dot)} />
                    <span className={clsx("truncate text-[13px] font-semibold", cs.head)}>{STAGE_LABEL[st]}</span>
                    <span className="rounded-full bg-white px-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">{items.length}</span>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-600">{inr(total)}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400">No deals</div>}
                  {items.map((o: any) => {
                    const isStalled = OPEN.has(st) && o.days_in_stage > STALL_DAYS;
                    const value = st === "partner_confirmed" ? o.confirmed_value_inr : o.proposed_value_inr;
                    return (
                      <button key={o.opportunity_id} onClick={() => openEdit(o)} title={`${o.brand} · ${o.campaign} · ${o.opportunity_id}`}
                        className={clsx("block w-full rounded-xl border-l-[3px] bg-white p-2.5 text-left shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-px hover:shadow-md hover:ring-brand-300",
                          isStalled ? "border-l-amber-400" : "border-l-transparent")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="truncate text-[13px] font-semibold text-slate-900">{o.brand}</div>
                          <div className="shrink-0 text-[13px] font-semibold tabular-nums text-navy">{inr(value)}</div>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          <span className="min-w-0 truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{o.campaign}</span>
                          {o.support_type === "in_kind" && <span className="shrink-0"><Badge tone="amber">In kind</Badge></span>}
                        </div>
                        {o.forecast_weight > 0 && OPEN.has(st) && (
                          <div className="mt-2 flex items-center gap-2" title="Chance this deal closes, from historical stage conversion and time idle">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, o.forecast_weight * 100)}%` }} /></div>
                            <span className="text-[10px] tabular-nums text-slate-500">{pct(o.forecast_weight)} win chance</span>
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                          <span className="truncate">{o.owner}</span>
                          <span className={clsx("flex shrink-0 items-center gap-0.5", isStalled && "font-semibold text-amber-700")}><Clock size={10} /> {o.days_in_stage}d</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {sel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]" onClick={() => setSel(null)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <Card title={`${sel.brand}`} subtitle={`${sel.campaign} · ${sel.support_type === "in_kind" ? "In kind" : "Cash"} · ${sel.owner} · now ${stageLabel(sel.stage)} · ${sel.opportunity_id}`} className="shadow-2xl">
              <div className="grid grid-cols-2 gap-3">
                <Field label="New stage"><select className={inputCls} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>{COLS.map((c) => <option key={c} value={c}>{STAGE_LABEL[c]}</option>)}</select></Field>
                <Field label="Effective date"><input type="date" className={inputCls} value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} /></Field>
                <Field label="Proposed value ₹"><input type="number" className={inputCls} value={form.proposed_value_inr} onChange={(e) => setForm({ ...form, proposed_value_inr: e.target.value })} /></Field>
                {form.stage === "partner_confirmed" && <Field label="Confirmed value ₹"><input type="number" className={inputCls} value={form.confirmed_value_inr} onChange={(e) => setForm({ ...form, confirmed_value_inr: e.target.value })} /></Field>}
                <div className="col-span-2"><Field label="Note"><input className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Why the change" /></Field></div>
              </div>
              <p className="mt-3 text-[11px] leading-snug text-slate-500">The change shows in every view dated on or after the effective date (18:00 IST). It defaults to the current as of date so the dashboard updates straight away.</p>
              <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setSel(null)}>Cancel</Button><Button onClick={save}>Save new version</Button></div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
