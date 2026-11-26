"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useApi, useApp, send } from "@/components/app-context";
import { Card, Badge, Table, Loading, ErrorBox, Button, Field, inputCls, selectCls, PageHeader, Notice, TASK_STATUS_LABEL, humanize } from "@/components/ui";

const STATUSES = ["todo", "in_progress", "blocked", "done"];
const empty = { title: "", description: "", owner_id: "", due_date: "", priority: "medium", sponsor_campaign_id: "", opportunity_id: "", brand_id: "" };

export default function Tasks() {
  const { refresh, asOf, ask } = useApp();
  const { data: d, error, loading } = useApi<any>("/api/tasks");
  const [form, setForm] = useState<any>(empty);
  const [filter, setFilter] = useState({ status: "", owner: "", overdue: false });
  const [msg, setMsg] = useState<string | null>(null);
  if (error) return <ErrorBox error={error} />;
  if (loading && !d) return <Loading />;
  if (!d) return null;
  const owners: { id: string; name: string }[] = d.owners;
  const tasks = d.tasks.filter((t: any) => (!filter.status || t.status === filter.status) && (!filter.owner || t.owner_id === filter.owner) && (!filter.overdue || t.overdue));

  async function create() {
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === "" ? null : v]));
      const r = await send("/api/tasks", "POST", body);
      setMsg(`Created ${r.task.task_id}`); setForm(empty); refresh();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function patch(id: string, p: any) { try { await send(`/api/tasks/${id}`, "PATCH", p); refresh(); } catch (e) { setMsg((e as Error).message); } }
  async function remove(id: string) { try { await send(`/api/tasks/${id}`, "DELETE"); refresh(); } catch (e) { setMsg((e as Error).message); } }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Act" title="Tasks and action items"
        subtitle={<>A task is overdue when it is not done and its due date is before {asOf}. Tasks drafted by the copilot are tagged.</>}
        actions={<Button variant="soft" onClick={() => ask("Review our open tasks against the biggest bottlenecks. What is missing or mis-prioritised?")}>Ask AI to review</Button>} />
      {msg && <Notice>{msg}</Notice>}
      <Card title="New task">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
          <div className="col-span-2"><Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field></div>
          <div className="col-span-2"><Field label="Description"><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
          <Field label="Owner"><select className={inputCls} value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}><option value="">—</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
          <Field label="Due"><input type="date" className={inputCls} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
          <Field label="Priority"><select className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{["low", "medium", "high"].map((p) => <option key={p} value={p}>{humanize(p)}</option>)}</select></Field>
          <Field label="Campaign"><select className={inputCls} value={form.sponsor_campaign_id} onChange={(e) => setForm({ ...form, sponsor_campaign_id: e.target.value })}><option value="">—</option>{d.campaigns.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Opportunity id"><input className={inputCls} placeholder="O012" value={form.opportunity_id} onChange={(e) => setForm({ ...form, opportunity_id: e.target.value })} /></Field>
          <Field label="Brand id"><input className={inputCls} placeholder="A001" value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })} /></Field>
          <div className="flex items-end"><Button onClick={create} disabled={!form.title.trim()}>Add task</Button></div>
        </div>
      </Card>
      <Card title={`Tasks (${tasks.length})`} right={
        <div className="flex gap-2 text-xs">
          <select className={selectCls} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}</select>
          <select className={selectCls} value={filter.owner} onChange={(e) => setFilter({ ...filter, owner: e.target.value })}><option value="">All owners</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          <label className="flex items-center gap-1 whitespace-nowrap"><input type="checkbox" checked={filter.overdue} onChange={(e) => setFilter({ ...filter, overdue: e.target.checked })} /> Overdue only</label>
        </div>}>
        <Table head={["Task", "Owner", "Due", "Priority", "Status", "Linked", "Source", ""]}>
          {tasks.map((t: any) => (
            <tr key={t.task_id} className={t.overdue ? "bg-rose-50/60" : ""}>
              <td className="min-w-72 px-2 py-1.5"><div className="font-semibold text-slate-900">{t.title}</div>{t.description && <div className="text-[11px] text-slate-500">{t.description}</div>}<div className="text-[10px] text-slate-400">{t.task_id}</div></td>
              <td className="px-2 py-1.5"><select className="rounded-md border border-slate-200 bg-white py-1 pl-2 text-xs" value={t.owner_id ?? ""} onChange={(e) => patch(t.task_id, { owner_id: e.target.value || null })}><option value="">—</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></td>
              <td className="px-2 py-1.5 text-xs"><input type="date" className="rounded-md border border-slate-200 px-1.5 py-1 text-xs" value={t.due_date ?? ""} onChange={(e) => patch(t.task_id, { due_date: e.target.value || null })} />{t.overdue && <div className="mt-1"><Badge tone="red">Overdue</Badge></div>}</td>
              <td className="px-2 py-1.5"><Badge tone={t.priority === "high" ? "red" : t.priority === "medium" ? "amber" : "slate"} dot>{humanize(t.priority)}</Badge></td>
              <td className="px-2 py-1.5"><select className="rounded-md border border-slate-200 bg-white py-1 pl-2 text-xs" value={t.status} onChange={(e) => patch(t.task_id, { status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}</select></td>
              <td className="px-2 py-1.5 text-[11px] text-slate-500">{[t.sponsor_campaign_id, t.opportunity_id, t.brand_id].filter(Boolean).join(" · ") || "—"}</td>
              <td className="px-2 py-1.5">{t.source === "copilot" ? <Badge tone="violet">Copilot</Badge> : <Badge>Manual</Badge>}</td>
              <td className="px-2 py-1.5"><button onClick={() => remove(t.task_id)} className="text-xs font-medium text-rose-600 hover:underline">Delete</button></td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
