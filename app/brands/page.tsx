"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useApi, useApp, send } from "@/components/app-context";
import { Card, Badge, Table, inr, Loading, ErrorBox, Button, Field, inputCls, selectCls, SimTag, PageHeader, StageBadge, stageLabel, QUAL_LABEL, humanize } from "@/components/ui";

const QT: Record<string, "green" | "blue" | "red" | "slate" | "amber"> = { qualified: "green", engaged: "blue", unqualified: "red", dormant: "amber", unreviewed: "slate" };

export default function Brands() {
  const { data: d, error, loading } = useApi<any>("/api/brands");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => (d?.brands ?? []).filter((b: any) => (!q || `${b.brand_name} ${b.brand_id} ${b.industry} ${b.owner_name}`.toLowerCase().includes(q.toLowerCase())) && (!status || b.qualification === status)), [d, q, status]);
  if (error) return <ErrorBox error={error} />;
  if (loading && !d) return <Loading />;
  if (!d) return null;
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Act" title="Brands"
        subtitle={<>{d.brands.length} brands in research as of {d.as_of}. Qualification shows the latest status on or before that date. Click a brand for contacts, deals and history.</>}
        actions={<>
          <input placeholder="Search brand, industry or owner" value={q} onChange={(e) => setQ(e.target.value)} className={inputCls + " w-64"} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}><option value="">All statuses</option>{["qualified", "engaged", "unreviewed", "dormant", "unqualified", "not yet assessed"].map((s) => <option key={s} value={s}>{QUAL_LABEL[s] ?? s}</option>)}</select>
        </>} />
      <Card>
        <Table head={["Brand", "Industry", "Owner", "Qualification", "Source campaign", "Touches", "Deals", "Flags"]} maxHeight="calc(100vh - 230px)">
          {rows.map((b: any) => (
            <tr key={b.brand_id} onClick={() => setSel(b.brand_id)} className="cursor-pointer">
              <td className="px-2 py-1.5 font-semibold text-slate-900">{b.brand_name}<span className="ml-1.5 text-[11px] font-normal text-slate-400">{b.brand_id}</span></td>
              <td className="px-2 py-1.5 text-xs">{b.industry}</td>
              <td className="px-2 py-1.5 text-xs">{b.owner_name}</td>
              <td className="px-2 py-1.5"><Badge tone={QT[b.qualification] ?? "slate"} dot>{QUAL_LABEL[b.qualification] ?? humanize(b.qualification)}</Badge></td>
              <td className="px-2 py-1.5 text-xs">{b.source_campaign ?? "—"}</td>
              <td className="px-2 py-1.5">{b.interactions}</td>
              <td className="px-2 py-1.5">{b.opportunity_stages.map((s: string, i: number) => <span key={i} className="mr-1"><StageBadge s={s} /></span>)}</td>
              <td className="px-2 py-1.5">{b.has_opt_out_contact && <Badge tone="red">Contact opted out</Badge>}</td>
            </tr>
          ))}
        </Table>
      </Card>
      {sel && <BrandDrawer id={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function BrandDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { asOf, refresh, ask } = useApp();
  const { data: b, error } = useApi<any>(`/api/brands/${id}`);
  const [form, setForm] = useState({ status: "qualified", reason: "", effective_date: asOf });
  const [msg, setMsg] = useState<string | null>(null);
  async function saveQual() {
    try { await send(`/api/brands/${id}`, "POST", form); setMsg("Qualification version saved."); refresh(); } catch (e) { setMsg((e as Error).message); }
  }
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {error && <ErrorBox error={error} />}
        {!b ? <Loading /> : (
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{b.brand.brand_name} <span className="text-sm text-slate-400">{b.brand.brand_id}</span></h2>
                <p className="text-xs text-slate-500">{b.brand.industry} · owner {b.brand.owner_name} · added {b.brand.created_at.slice(0, 10)} · current: <b>{b.current_qualification?.qualification_status ?? "not assessed"}</b></p>
              </div>
              <div className="flex gap-2"><Button variant="secondary" onClick={() => ask(`Summarise the relationship with ${b.brand.brand_name} (${b.brand.brand_id}) and recommend the next step.`)}>Ask AI</Button><Button variant="ghost" onClick={onClose}>Close</Button></div>
            </div>
            <Card title="Contacts">
              <ul className="space-y-1 text-sm">{b.contacts.map((c: any) => <li key={c.contact_id}>{c.contact_name} <span className="text-xs text-slate-500">· {c.job_title} · {c.contact_id}</span> {c.opted_out && <Badge tone="red">Opted out, this contact only</Badge>}</li>)}</ul>
            </Card>
            <Card title="Opportunities">
              {b.opportunities.length === 0 ? <p className="text-sm text-slate-500">None.</p> : b.opportunities.map((o: any) => (
                <div key={o.opportunity_id} className="mb-2 text-sm">
                  <div><b>{o.opportunity_id}</b> · {o.campaign} · {o.support_type} · <StageBadge s={o.stage} /> · proposed {inr(o.proposed_value_inr)} {o.confirmed_value_inr ? `· confirmed ${inr(o.confirmed_value_inr)}` : ""}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{o.history.map((h: any) => `${h.at.slice(0, 10)} ${stageLabel(h.stage)}`).join("  ›  ")}</div>
                </div>
              ))}
            </Card>
            {b.payments_simulated.length > 0 && <Card title={<>Payments <SimTag /></>}><ul className="text-xs">{b.payments_simulated.map((p: any) => <li key={p.payment_id}>{p.installment}: {inr(p.amount_inr)} invoiced {p.invoiced_at.slice(0, 10)} · {p.received_as_of ? `received ${p.received_at.slice(0, 10)} (net ${inr(p.net_received_inr)})` : `outstanding, due ${p.due_at.slice(0, 10)}`}</li>)}</ul></Card>}
            {b.activations.length > 0 && <Card title="Activations"><ul className="text-xs">{b.activations.map((a: any) => <li key={a.activation_id}>{a.attendee_campaign_name} (linked {a.linked_at.slice(0, 10)}) — {a.activation_note}</li>)}</ul></Card>}
            <Card title="Qualification history">
              <ul className="space-y-1 text-xs">{b.qualification_history.map((q: any, i: number) => <li key={i}><Badge tone={QT[q.status] ?? "slate"}>{QUAL_LABEL[q.status] ?? humanize(q.status)}</Badge> {q.at.slice(0, 10)} · {q.reason} <span className="text-slate-400">({q.source_campaign})</span></li>)}</ul>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                <Field label="New status"><select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{["unreviewed", "engaged", "qualified", "unqualified", "dormant"].map((s) => <option key={s} value={s}>{QUAL_LABEL[s]}</option>)}</select></Field>
                <Field label="Effective date"><input type="date" className={inputCls} value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} /></Field>
                <Field label="Reason"><input className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
              </div>
              <div className="mt-2 flex items-center gap-2"><Button onClick={saveQual}>Save qualification version</Button>{msg && <span className="text-xs text-slate-600">{msg}</span>}</div>
            </Card>
            <Card title={`Interaction timeline (${b.interactions.length})`}>
              <ul className="max-h-72 space-y-0.5 overflow-y-auto text-[11px]">{b.interactions.map((r: any, i: number) => <li key={i}><span className="text-slate-400">{r.at.slice(0, 16).replace("T", " ")}</span> · {r.campaign} · <b>{r.event}</b> ({r.outcome}) · {r.contact}</li>)}</ul>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
