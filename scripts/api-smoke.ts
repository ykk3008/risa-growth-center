/**
 * API end-to-end smoke test against a running app (resets data at start and end).
 *   npx tsx scripts/api-smoke.ts http://localhost:3000 [--allow-reset for non-local URLs]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
if (!/localhost|127\.0\.0\.1/.test(BASE) && !process.argv.includes("--allow-reset")) { console.error("Resets data: pass --allow-reset for non-local URLs"); process.exit(1); }

let fails = 0;
const check = (name: string, cond: boolean, extra?: unknown) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : " " + JSON.stringify(extra)}`); if (!cond) fails++; };
const call = async (path: string, method = "GET", body?: unknown) => {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const kpi = async (d: string) => (await call(`/api/dashboard?asOf=${d}`)).json.kpis;

async function main() {
  check("reset requires confirmation", (await call("/api/admin/reset", "POST", {})).status === 400);
  check("reset with confirmation", (await call("/api/admin/reset", "POST", { confirm: "RESET" })).json.ok === true);
  const before = await kpi("2025-04-01");
  check("baseline confirmed on 1 Apr = 23", before.confirmed_partnerships === 23, before.confirmed_partnerships);

  const opps = (await call("/api/opportunities?asOf=2025-04-01")).json.opportunities as { opportunity_id: string; stage: string; support_type: string; channel: string }[];
  const target = opps.find((o) => o.stage === "negotiating" && o.support_type === "cash" && (o.channel === "email" || o.channel === "linkedin"))!; // a cold deal that never confirms in the source
  const ed = await call(`/api/opportunities/${target.opportunity_id}`, "POST", { stage: "partner_confirmed", effective_date: "2025-04-01", confirmed_value_inr: 90000 });
  check("stage edit accepted", ed.json.ok === true, ed.json);
  check("confirming a cash deal creates simulated invoices", (ed.json.payment_changes ?? []).length === 2, ed.json.payment_changes);
  const after = await kpi("2025-04-01");
  check("KPI updates on the effective date", after.confirmed_partnerships === 24, after.confirmed_partnerships);
  check("no leakage to the day before", (await kpi("2025-03-31")).confirmed_partnerships === before.confirmed_partnerships - 0 && (await kpi("2025-03-31")).confirmed_partnerships <= 23);
  check("cash invoiced rises", after.cash_simulated.invoiced_gross_inr > before.cash_simulated.invoiced_gross_inr, [before.cash_simulated.invoiced_gross_inr, after.cash_simulated.invoiced_gross_inr]);

  check("bad stage -> 400", (await call(`/api/opportunities/${target.opportunity_id}`, "POST", { stage: "won", effective_date: "2025-04-01" })).status === 400);
  check("bad date -> 400", (await call(`/api/opportunities/${target.opportunity_id}`, "POST", { stage: "lost", effective_date: "April 1" })).status === 400);
  check("confirmed value 0 -> 400", (await call(`/api/opportunities/${target.opportunity_id}`, "POST", { stage: "partner_confirmed", effective_date: "2025-04-01", confirmed_value_inr: 0 })).status === 400);

  const t = await call("/api/tasks", "POST", { title: "Smoke task", owner_id: "T03", due_date: "2025-04-05", priority: "high" });
  check("task for T03 created", t.json.ok === true, t.json);
  check("unknown owner -> 400", (await call("/api/tasks", "POST", { title: "x", owner_id: "T99" })).status === 400);
  check("bad task status -> 400", (await call(`/api/tasks/${t.json.task?.task_id}`, "PATCH", { status: "finished" })).status === 400);
  check("task status update", (await call(`/api/tasks/${t.json.task?.task_id}`, "PATCH", { status: "done" })).json.ok === true);

  const audit = (await call("/api/audit")).json.audit as { action: string }[];
  check("audit log records edits", audit.some((a) => a.action === "opportunity_stage_change") && audit.some((a) => a.action === "task_create"));
  check("bet signals endpoint", ((await call("/api/bets?asOf=2025-04-20")).json.bets ?? []).length === 5);

  await call("/api/admin/reset", "POST", { confirm: "RESET" });
  check("reset restores source state", (await kpi("2025-04-01")).confirmed_partnerships === 23);
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
}
main();
