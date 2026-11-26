/**
 * Mutations shared by the UI API routes and the AI copilot (after explicit user confirmation).
 * Every mutation writes an audit_log row. History-table edits append a new full-state version.
 */
import "server-only";
import { getStore } from "./store";
import { Stage, STAGE_ORDER, QUAL_STATUSES, QualStatus, Task, OppHistory, Qualification } from "./types";
import { snapshot, ts, eodIST, parseAsOf, DAY, istDate } from "./metrics";

const ALL_STAGES: Stage[] = [...STAGE_ORDER, "lost", "withdrawn"];
const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0")}`;
const atIST = (date: string, hhmm = "18:00") => `${date.slice(0, 10)}T${hhmm}:00+05:30`;

async function audit(actor: string, action: string, entity: string, entity_id: string, detail: unknown) {
  await getStore().insert("audit_log", { audit_id: newId("AU"), at: nowIso(), actor, action, entity, entity_id, detail: JSON.stringify(detail) });
}

export class ActionError extends Error {}

const TASK_STATUS = ["todo", "in_progress", "blocked", "done"];
const PRIORITY = ["low", "medium", "high"];
function needDate(v: unknown, name: string): string {
  const d = parseAsOf(v);
  if (!d) throw new ActionError(`${name} must be a real date as YYYY-MM-DD`);
  return d;
}
function optNum(v: unknown, name: string): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!isFinite(n) || n < 0) throw new ActionError(`${name} must be a number >= 0`);
  return Math.round(n);
}
async function ownerIds(): Promise<Set<string>> {
  const db = await getStore().load();
  return new Set(snapshot(db).owners.keys());
}

export async function changeOpportunityStage(input: {
  opportunity_id: string; stage: Stage; effective_date: string; proposed_value_inr?: number; confirmed_value_inr?: number; note?: string; actor?: string;
}) {
  const db = await getStore().load();
  if (!ALL_STAGES.includes(input.stage)) throw new ActionError(`Unknown stage ${input.stage}`);
  input.effective_date = needDate(input.effective_date, "effective_date");
  input.proposed_value_inr = optNum(input.proposed_value_inr, "proposed_value_inr");
  input.confirmed_value_inr = optNum(input.confirmed_value_inr, "confirmed_value_inr");
  const opp = db.opportunities.find((o) => o.opportunity_id === input.opportunity_id);
  if (!opp) throw new ActionError(`Opportunity ${input.opportunity_id} not found`);
  const s = snapshot(db, input.effective_date);
  const cur = s.oppLatest.get(opp.opportunity_id) ?? [...db.opp_history].filter((h) => h.opportunity_id === opp.opportunity_id).sort((a, b) => ts(a.effective_at) - ts(b.effective_at))[0];
  if (!cur) throw new ActionError("Opportunity has no history yet");
  const proposed = input.proposed_value_inr ?? cur.proposed_value_inr;
  let confirmed = 0;
  if (input.stage === "partner_confirmed") {
    confirmed = input.confirmed_value_inr ?? proposed;
    if (!(confirmed > 0)) throw new ActionError("A confirmed partnership needs a confirmed value > 0");
  }
  const row: OppHistory = {
    opportunity_name: cur.opportunity_name, brand_name: cur.brand_name, stage: input.stage, proposed_value_inr: proposed,
    confirmed_value_inr: confirmed, owner_name: cur.owner_name, effective_at: atIST(input.effective_date),
    history_id: newId("OH9"), opportunity_id: opp.opportunity_id, brand_id: opp.brand_id, owner_id: cur.owner_id,
    source: "app_edit", note: input.note ?? null,
  };
  await getStore().insert("opp_history", row as unknown as Record<string, unknown>);
  await audit(input.actor ?? "user", "opportunity_stage_change", "opportunity", opp.opportunity_id, { from: cur.stage, to: input.stage, proposed, confirmed, effective_at: row.effective_at });
  const payment_changes = await syncPayments(db, opp.opportunity_id, opp.brand_id, opp.support_type, cur.stage, input.stage, confirmed, row.effective_at);
  const later = db.opp_history.filter((h) => h.opportunity_id === opp.opportunity_id && ts(h.effective_at) > ts(row.effective_at));
  return { ok: true, version: row, previous_stage: cur.stage, payment_changes,
    warning: later.length ? `A later source version exists (${later.map((h) => `${h.stage} on ${h.effective_at.slice(0, 10)}`).join(", ")}); it will supersede this edit from that date.` : null };
}

export async function changeQualification(input: { brand_id: string; status: QualStatus; reason: string; effective_date: string; actor?: string }) {
  if (!QUAL_STATUSES.includes(input.status)) throw new ActionError(`Unknown status ${input.status}`);
  input.effective_date = needDate(input.effective_date, "effective_date");
  const db = await getStore().load();
  const b = db.brands.find((x) => x.brand_id === input.brand_id);
  if (!b) throw new ActionError(`Brand ${input.brand_id} not found`);
  const cur = snapshot(db, input.effective_date).qualLatest.get(b.brand_id);
  const row: Qualification = {
    brand_name: b.brand_name, qualification_status: input.status, reason: input.reason || "Updated in Growth Center",
    source_campaign_name: cur?.source_campaign_name ?? "", effective_at: atIST(input.effective_date), history_id: newId("BQ9"),
    brand_id: b.brand_id, sponsor_campaign_id: cur?.sponsor_campaign_id ?? "", source: "app_edit",
  };
  await getStore().insert("qualification", row as unknown as Record<string, unknown>);
  await audit(input.actor ?? "user", "qualification_change", "brand", b.brand_id, { from: cur?.qualification_status, to: input.status });
  return { ok: true, version: row };
}

export async function createTask(input: Partial<Task> & { title: string }, actor = "user") {
  const db = await getStore().load();
  if (!input.title?.trim()) throw new ActionError("Task title is required");
  if (input.owner_id && !snapshot(db).owners.has(input.owner_id)) throw new ActionError(`Unknown owner ${input.owner_id}`);
  if (input.due_date) input.due_date = needDate(input.due_date, "due_date");
  if (input.status && !TASK_STATUS.includes(input.status)) throw new ActionError(`status must be one of ${TASK_STATUS.join(", ")}`);
  if (input.priority && !PRIORITY.includes(input.priority)) throw new ActionError(`priority must be one of ${PRIORITY.join(", ")}`);
  if (input.brand_id && !db.brands.some((b) => b.brand_id === input.brand_id)) throw new ActionError(`Unknown brand ${input.brand_id}`);
  if (input.opportunity_id && !db.opportunities.some((o) => o.opportunity_id === input.opportunity_id)) throw new ActionError(`Unknown opportunity ${input.opportunity_id}`);
  if (input.sponsor_campaign_id && !db.campaigns.some((c) => c.sponsor_campaign_id === input.sponsor_campaign_id)) throw new ActionError(`Unknown campaign ${input.sponsor_campaign_id}`);
  const t: Task = {
    task_id: newId("TK"), title: input.title.trim(), description: input.description ?? "", owner_id: input.owner_id ?? null,
    due_date: input.due_date ?? null, status: input.status ?? "todo", priority: input.priority ?? "medium",
    brand_id: input.brand_id ?? null, opportunity_id: input.opportunity_id ?? null, sponsor_campaign_id: input.sponsor_campaign_id ?? null,
    source: input.source ?? (actor === "copilot" ? "copilot" : "manual"), created_at: nowIso(), updated_at: nowIso(),
  };
  await getStore().insert("tasks", t as unknown as Record<string, unknown>);
  await audit(actor, "task_create", "task", t.task_id, { title: t.title });
  return { ok: true, task: t };
}

export async function updateTask(task_id: string, patch: Partial<Task>, actor = "user") {
  const allowed: (keyof Task)[] = ["title", "description", "owner_id", "due_date", "status", "priority", "brand_id", "opportunity_id", "sponsor_campaign_id"];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k as keyof Task)));
  if (clean.status !== undefined && !TASK_STATUS.includes(String(clean.status))) throw new ActionError(`status must be one of ${TASK_STATUS.join(", ")}`);
  if (clean.priority !== undefined && !PRIORITY.includes(String(clean.priority))) throw new ActionError(`priority must be one of ${PRIORITY.join(", ")}`);
  if (clean.due_date) clean.due_date = needDate(clean.due_date, "due_date");
  if (clean.owner_id && !(await ownerIds()).has(String(clean.owner_id))) throw new ActionError(`Unknown owner ${clean.owner_id}`);
  if (clean.title !== undefined && !String(clean.title).trim()) throw new ActionError("Task title is required");
  await getStore().update("tasks", task_id, { ...clean, updated_at: nowIso() });
  await audit(actor, "task_update", "task", task_id, clean);
  return { ok: true };
}

export async function deleteTask(task_id: string, actor = "user") {
  await getStore().remove("tasks", task_id);
  await audit(actor, "task_delete", "task", task_id, {});
  return { ok: true };
}

export async function updateCampaignPlan(sponsor_campaign_id: string, patch: { budget_inr?: number; planned_hours?: number; notes?: string }, actor = "user") {
  const clean: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.budget_inr !== undefined) { if (!(patch.budget_inr >= 0)) throw new ActionError("budget must be >= 0"); clean.budget_inr = Math.round(patch.budget_inr); }
  if (patch.planned_hours !== undefined) { if (!(patch.planned_hours >= 0)) throw new ActionError("hours must be >= 0"); clean.planned_hours = Math.round(patch.planned_hours); }
  if (patch.notes !== undefined) clean.notes = patch.notes;
  await getStore().update("campaign_plan", sponsor_campaign_id, clean);
  await audit(actor, "campaign_plan_update", "campaign", sponsor_campaign_id, clean);
  return { ok: true };
}

export async function setTargets(input: { qualified_brands_goal: number; confirmed_partnerships_goal: number; effective_date: string; label?: string }, actor = "user") {
  if (!(input.qualified_brands_goal > 0 && input.confirmed_partnerships_goal > 0)) throw new ActionError("Goals must be positive numbers");
  input.effective_date = needDate(input.effective_date, "effective_date");
  const row = { effective_at: atIST(input.effective_date, "09:00"), qualified_brands_goal: Math.round(input.qualified_brands_goal), confirmed_partnerships_goal: Math.round(input.confirmed_partnerships_goal), target_version: input.label || `Edited plan ${input.effective_date}` };
  await getStore().insert("targets", row);
  await audit(actor, "targets_new_version", "targets", row.target_version, row);
  return { ok: true, version: row };
}

export async function markPaymentReceived(payment_id: string, received_date: string, actor = "user") {
  received_date = needDate(received_date, "received_date");
  const db = await getStore().load();
  const pay = db.payments.find((x) => x.payment_id === payment_id);
  if (!pay) throw new ActionError(`Payment ${payment_id} not found`);
  if (pay.voided_at) throw new ActionError("This invoice was voided");
  if (eodIST(received_date) < ts(pay.invoiced_at)) throw new ActionError("received_date is before the invoice date");
  await getStore().update("payments", payment_id, { received_at: atIST(received_date, "12:00") });
  await audit(actor, "payment_received", "payment", payment_id, { received_date });
  return { ok: true };
}

export async function resetData(actor = "user", confirm?: string) {
  if (confirm !== "RESET") throw new ActionError('Reset wipes all edits. Send {"confirm":"RESET"} to proceed.');
  await getStore().reset();
  await audit(actor, "reset_to_source", "all", "-", {});
  return { ok: true };
}

/** Keeps the SIMULATED payments layer consistent with stage edits. */
async function syncPayments(db: Awaited<ReturnType<ReturnType<typeof getStore>["load"]>>, opportunity_id: string, brand_id: string, support: string, from: string, to: string, confirmed: number, at: string) {
  const changes: string[] = [];
  const mine = db.payments.filter((p) => p.opportunity_id === opportunity_id && !p.voided_at);
  if (to === "partner_confirmed" && support === "cash" && mine.length === 0) {
    const date = at.slice(0, 10);
    for (const [part, lag] of [["advance", 0], ["balance", 7]] as const) {
      const inv = istDate(eodIST(date) + lag * DAY);
      const gross = Math.round(confirmed / 2);
      const row = { payment_id: newId("PAY9"), opportunity_id, brand_id, installment: part, amount_inr: gross, tds_inr: Math.round(gross * 0.02),
        invoiced_at: `${inv}T12:00:00+05:30`, due_at: `${istDate(eodIST(inv) + 15 * DAY)}T12:00:00+05:30`, received_at: null,
        net_received_inr: gross - Math.round(gross * 0.02), utr: "", is_simulated: true, voided_at: null };
      await getStore().insert("payments", row);
      changes.push(`invoiced ${part} ${row.payment_id}`);
    }
  }
  if (from === "partner_confirmed" && to !== "partner_confirmed") {
    for (const p of mine.filter((x) => !x.received_at)) {
      await getStore().update("payments", p.payment_id, { voided_at: at });
      changes.push(`voided unpaid ${p.payment_id}`);
    }
  }
  return changes;
}
