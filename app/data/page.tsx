"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useApi, useApp, send } from "@/components/app-context";
import { Card, Table, Badge, inr, Loading, ErrorBox, Button, Field, inputCls, SimTag } from "@/components/ui";

export default function DataPage() {
  const { asOf, refresh } = useApp();
  const { data: d, error } = useApi<any>("/api/dashboard");
  const { data: p } = useApi<any>("/api/payments");
  const { data: a } = useApi<any>("/api/audit", false);
  const [t, setT] = useState({ qualified_brands_goal: "", confirmed_partnerships_goal: "", effective_date: asOf, label: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  async function run(fn: () => Promise<unknown>, okMsg: string) { try { await fn(); setMsg(okMsg); refresh(); } catch (e) { setMsg((e as Error).message); } }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Data &amp; settings</h1>
      {msg && <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs">{msg}</div>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Data sources & quality">
          <ul className="space-y-1 text-sm">
            <li>Store: <b>{d.meta.store}</b> {d.meta.store === "local-file" && <span className="text-xs text-amber-700">(dev mode — set Supabase env vars for persistence on the deployed app)</span>}</li>
            <li>Source: provided Sponsor Dataset (fictional {d.meta.event.event_name}), history {d.meta.history_start} → {d.meta.history_end}</li>
            <li>Duplicate import-retry rows ignored: interactions {d.kpis.data_quality.duplicate_rows_removed.interactions}, qualification {d.kpis.data_quality.duplicate_rows_removed.qualification}, opportunity history {d.kpis.data_quality.duplicate_rows_removed.opp_history}</li>
            <li><SimTag /> Simulated layers: campaign budgets/hours, sponsor payments (no spend or bank data in the source).</li>
          </ul>
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs">
            <b>Reset to original source data</b> — removes every edit, task and audit row and reloads the dataset (used for testing the copilot on the original data).
            <div className="mt-2">{armed
              ? <span className="inline-flex gap-2"><Button variant="danger" onClick={() => { setArmed(false); run(() => send("/api/admin/reset", "POST", { confirm: "RESET" }), "Data reset to source."); }}>Yes, wipe all edits</Button><Button variant="secondary" onClick={() => setArmed(false)}>Cancel</Button></span>
              : <Button variant="danger" onClick={() => setArmed(true)}>Reset data…</Button>}</div>
          </div>
        </Card>
        <Card title="Targets (versioned)" subtitle="The version in force at a date is the latest with effective date ≤ that date">
          <Table head={["Version", "Effective", "Qualified goal", "Confirmed goal"]}>
            {d.targets.map((x: any) => <tr key={x.target_version + x.effective_at}><td className="px-2 py-1.5">{x.target_version}</td><td className="px-2 py-1.5 text-xs">{x.effective_at.slice(0, 10)}</td><td className="px-2 py-1.5">{x.qualified_brands_goal}</td><td className="px-2 py-1.5">{x.confirmed_partnerships_goal}</td></tr>)}
          </Table>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            <Field label="Qualified goal"><input className={inputCls} value={t.qualified_brands_goal} onChange={(e) => setT({ ...t, qualified_brands_goal: e.target.value })} /></Field>
            <Field label="Confirmed goal"><input className={inputCls} value={t.confirmed_partnerships_goal} onChange={(e) => setT({ ...t, confirmed_partnerships_goal: e.target.value })} /></Field>
            <Field label="Effective"><input type="date" className={inputCls} value={t.effective_date} onChange={(e) => setT({ ...t, effective_date: e.target.value })} /></Field>
            <Field label="Label"><input className={inputCls} value={t.label} onChange={(e) => setT({ ...t, label: e.target.value })} /></Field>
            <div className="flex items-end"><Button onClick={() => run(() => send("/api/targets", "POST", t), "New target version saved.")}>Add version</Button></div>
          </div>
        </Card>
      </div>
      <Card title={<>Sponsor payments <SimTag /></>} subtitle="Simulated invoices: 50% advance at confirmation, balance +7 days, 2% TDS. Mark receipts to update cash analytics.">
        {!p ? <Loading /> : (
          <Table head={["Payment", "Brand", "Opp", "Installment", "Gross", "Invoiced", "Due", "Status", ""]}>
            {p.payments.map((x: any) => (
              <tr key={x.payment_id} className="text-xs">
                <td className="px-2 py-1">{x.payment_id}</td><td className="px-2 py-1">{x.brand_name}</td><td className="px-2 py-1">{x.opportunity_id}</td><td className="px-2 py-1">{x.installment}</td><td className="px-2 py-1">{inr(x.amount_inr)}</td>
                <td className="px-2 py-1">{x.invoiced_at.slice(0, 10)}</td><td className="px-2 py-1">{x.due_at.slice(0, 10)}</td>
                <td className="px-2 py-1">{x.received_as_of ? <Badge tone="green">received {x.received_at.slice(0, 10)}</Badge> : x.overdue ? <Badge tone="red">overdue</Badge> : <Badge>open</Badge>}</td>
                <td className="px-2 py-1">{!x.received_as_of && <button className="text-indigo-600 hover:underline" onClick={() => run(() => send(`/api/payments/${x.payment_id}`, "PATCH", { received_date: asOf }), `${x.payment_id} marked received on ${asOf}.`)}>mark received {asOf}</button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="Audit log (latest 200)">
        {!a ? <Loading /> : a.audit.length === 0 ? <p className="text-sm text-slate-500">No changes yet.</p> : (
          <Table head={["When", "Actor", "Action", "Entity", "Detail"]}>
            {a.audit.map((x: any) => <tr key={x.audit_id} className="text-xs"><td className="px-2 py-1">{x.at.slice(0, 19).replace("T", " ")}</td><td className="px-2 py-1">{x.actor}</td><td className="px-2 py-1">{x.action}</td><td className="px-2 py-1">{x.entity} {x.entity_id}</td><td className="max-w-md truncate px-2 py-1 font-mono text-[10px]">{x.detail}</td></tr>)}
          </Table>
        )}
      </Card>
    </div>
  );
}
