/**
 * Metrics engine — the single source of truth for the dashboard AND the AI copilot.
 *
 * Rules implemented exactly as the dataset README requires:
 *  - Deduplicate identical source IDs (import retries).
 *  - "As of" a date = end of that day in Asia/Kolkata. Only rows with timestamps <= cutoff are visible.
 *  - History tables are full-state versions: take the latest version <= cutoff per entity; never sum versions.
 *  - Attempts, contacts, brands, qualified brands and confirmed partnerships are different populations.
 *  - confirmed_value_inr is NOT cash; in_kind is NOT cash; activations are associations, not causal uplift.
 */
import {
  DB, Interaction, Qualification, OppHistory, Opportunity, Stage, OPEN_STAGES, STAGE_ORDER, TargetRow, Task, Payment,
} from "./types";

// ------------------------------------------------------------------ time
export const ts = (s: string | null | undefined): number => (s ? Date.parse(s.length === 10 ? `${s}T00:00:00+05:30` : s) : NaN);
export const eodIST = (date: string): number => Date.parse(`${date.slice(0, 10)}T23:59:59.999+05:30`);
export const istDate = (ms: number): string => new Date(ms + 5.5 * 3600e3).toISOString().slice(0, 10);
export const DAY = 86400e3;

/** Validates a YYYY-MM-DD date; returns null if malformed or not a real calendar date. */
export function parseAsOf(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return isNaN(eodIST(v)) || istDate(eodIST(v)) !== v ? null : v;
}

// ------------------------------------------------------------------ helpers
export function dedupe<T>(rows: T[], key: keyof T): { rows: T[]; duplicates: number } {
  const seen = new Set<unknown>();
  const out: T[] = [];
  for (const r of rows) {
    const k = r[key];
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return { rows: out, duplicates: rows.length - out.length };
}

function latestBy<T extends { effective_at: string; history_id: string }>(rows: T[], key: keyof T, cutoff: number): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    if (!(ts(r.effective_at) <= cutoff)) continue; // also skips malformed timestamps
    const k = String(r[key]);
    const cur = m.get(k);
    if (!cur || ts(r.effective_at) > ts(cur.effective_at) ||
        (ts(r.effective_at) === ts(cur.effective_at) && r.history_id > cur.history_id)) m.set(k, r);
  }
  return m;
}

const pct = (n: number, d: number) => (d > 0 ? n / d : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round = (x: number | null, k = 3) => (x === null || !isFinite(x) ? null : Math.round(x * 10 ** k) / 10 ** k);

export const WARM_CHANNELS = new Set(["introduction", "web_inbound"]);

// ------------------------------------------------------------------ snapshot
export interface Snapshot {
  asOf: string;
  cutoff: number;
  db: DB;
  dedup: { interactions: number; qualification: number; opp_history: number };
  interactions: Interaction[];          // deduped, occurred_at <= cutoff
  qualLatest: Map<string, Qualification>;
  oppLatest: Map<string, OppHistory>;   // only opportunities that exist by cutoff
  oppHistory: OppHistory[];             // deduped versions <= cutoff
  opps: Map<string, Opportunity>;
  target: TargetRow;
  brandsVisible: Set<string>;
  owners: Map<string, string>;
  campaignsById: Map<string, DB["campaigns"][number]>;
}

export function defaultAsOf(db: DB): string {
  return db.event[0]?.history_end?.slice(0, 10) ?? istDate(Date.now());
}

export function snapshot(db: DB, asOf?: string): Snapshot {
  const date = (asOf || defaultAsOf(db)).slice(0, 10);
  const cutoff = eodIST(date);
  const I = dedupe(db.interactions, "interaction_id");
  const Q = dedupe(db.qualification, "history_id");
  const H = dedupe(db.opp_history, "history_id");
  const interactions = I.rows.filter((r) => ts(r.occurred_at) <= cutoff);
  const qualLatest = latestBy(Q.rows, "brand_id", cutoff);
  const oppLatest = latestBy(H.rows, "opportunity_id", cutoff);
  const oppHistory = H.rows.filter((r) => ts(r.effective_at) <= cutoff);
  const opps = new Map(db.opportunities.map((o) => [o.opportunity_id, o]));
  const tSorted = [...db.targets].sort((a, b) => ts(a.effective_at) - ts(b.effective_at));
  const target = [...tSorted].reverse().find((t) => ts(t.effective_at) <= cutoff) ?? tSorted[0];
  const brandsVisible = new Set(db.brands.filter((b) => ts(b.created_at) <= cutoff).map((b) => b.brand_id));
  const owners = new Map<string, string>();
  for (const r of [...db.brands, ...db.campaigns, ...db.opp_history]) if (r.owner_id) owners.set(r.owner_id, r.owner_name);
  return {
    asOf: date, cutoff, db, dedup: { interactions: I.duplicates, qualification: Q.duplicates, opp_history: H.duplicates },
    interactions, qualLatest, oppLatest, oppHistory, opps, target, brandsVisible, owners,
    campaignsById: new Map(db.campaigns.map((c) => [c.sponsor_campaign_id, c])),
  };
}

// ------------------------------------------------------------------ KPIs
export function kpis(s: Snapshot) {
  const I = s.interactions;
  const latest = [...s.oppLatest.values()];
  const byStage: Record<string, number> = {};
  for (const st of [...STAGE_ORDER, "lost", "withdrawn"]) byStage[st] = 0;
  for (const h of latest) byStage[h.stage] = (byStage[h.stage] ?? 0) + 1;
  const confirmed = latest.filter((h) => h.stage === "partner_confirmed");
  const isCash = (h: OppHistory) => s.opps.get(h.opportunity_id)?.support_type === "cash";
  const open = latest.filter((h) => OPEN_STAGES.includes(h.stage));
  const qualCounts: Record<string, number> = { unreviewed: 0, engaged: 0, qualified: 0, unqualified: 0, dormant: 0 };
  for (const q of s.qualLatest.values()) qualCounts[q.qualification_status] = (qualCounts[q.qualification_status] ?? 0) + 1;
  const qualified = qualCounts.qualified;
  const ev = s.db.event[0];
  const start = ts(ev.history_start), eventStart = ts(ev.event_starts_at);
  const elapsed = Math.min(1, Math.max(0, (s.cutoff - start) / (eventStart - start)));
  const fc = forecast(s);
  const cash = cashCollection(s);
  return {
    as_of: s.asOf,
    target_version: s.target.target_version,
    targets: { qualified_brands_goal: s.target.qualified_brands_goal, confirmed_partnerships_goal: s.target.confirmed_partnerships_goal },
    brands_in_research: s.brandsVisible.size,
    brands_contacted: new Set(I.map((r) => r.brand_id)).size,
    contacts_reached: new Set(I.map((r) => r.contact_id)).size,
    outreach_attempts: new Set(I.map((r) => r.attempt_id)).size,
    outreach_sends: I.filter((r) => r.event_type === "outreach_sent").length,
    replies: I.filter((r) => r.event_type === "replied").length,
    positive_replies: I.filter((r) => r.outcome === "positive").length,
    brands_replied: new Set(I.filter((r) => r.event_type === "replied").map((r) => r.brand_id)).size,
    meetings_held: I.filter((r) => r.event_type === "meeting_held").length,
    brands_met: new Set(I.filter((r) => r.event_type === "meeting_held").map((r) => r.brand_id)).size,
    opt_out_contacts: new Set(I.filter((r) => r.event_type === "opt_out").map((r) => r.contact_id)).size,
    qualification_status_counts: qualCounts,
    qualified_brands: qualified,
    qualified_attainment: round(pct(qualified, s.target.qualified_brands_goal)),
    opportunities_total: latest.length,
    opportunities_by_stage: byStage,
    confirmed_partnerships: confirmed.length,
    confirmed_attainment: round(pct(confirmed.length, s.target.confirmed_partnerships_goal)),
    confirmed_value_inr: sum(confirmed.map((h) => h.confirmed_value_inr)),
    confirmed_cash_type_value_inr: sum(confirmed.filter(isCash).map((h) => h.confirmed_value_inr)),
    confirmed_in_kind_value_inr: sum(confirmed.filter((h) => !isCash(h)).map((h) => h.confirmed_value_inr)),
    confirmed_cash_type_deals: confirmed.filter(isCash).length,
    avg_confirmed_deal_inr: confirmed.length ? Math.round(sum(confirmed.map((h) => h.confirmed_value_inr)) / confirmed.length) : 0,
    open_opportunities: open.length,
    open_pipeline_proposed_inr: sum(open.map((h) => h.proposed_value_inr)),
    lost_or_withdrawn: latest.filter((h) => h.stage === "lost" || h.stage === "withdrawn").length,
    lost_or_withdrawn_value_inr: sum(latest.filter((h) => h.stage === "lost" || h.stage === "withdrawn").map((h) => h.proposed_value_inr)),
    pacing: {
      share_of_campaign_elapsed: round(elapsed),
      expected_confirmed_by_now_linear: round(s.target.confirmed_partnerships_goal * elapsed, 1),
      expected_qualified_by_now_linear: round(s.target.qualified_brands_goal * elapsed, 1),
      note: "Linear pacing from history_start to event start (an assumption, not a source plan).",
    },
    forecast: { projected_confirmed: fc.projected_confirmed, projected_value_inr: fc.projected_value_inr, gap_to_target: round(s.target.confirmed_partnerships_goal - fc.projected_confirmed, 1) },
    cash_simulated: cash.totals,
    data_quality: { duplicate_rows_removed: s.dedup },
  };
}

// ------------------------------------------------------------------ funnels
export function funnelRows(s: Snapshot, groupBy: "campaign" | "owner" | "industry" | "channel_group") {
  const brandsById = new Map(s.db.brands.map((b) => [b.brand_id, b]));
  const keyOfInteraction = (r: Interaction) =>
    groupBy === "campaign" ? r.sponsor_campaign_id
      : groupBy === "owner" ? r.owner_id
        : groupBy === "industry" ? brandsById.get(r.brand_id)?.industry ?? "?"
          : WARM_CHANNELS.has(r.channel) ? "warm/inbound" : "cold outbound";
  const campOf = (id: string) => s.campaignsById.get(id);
  const keyOfOpp = (h: OppHistory) => {
    const o = s.opps.get(h.opportunity_id)!;
    if (groupBy === "campaign") return o.sponsor_campaign_id;
    if (groupBy === "owner") return h.owner_id;
    if (groupBy === "industry") return brandsById.get(h.brand_id)?.industry ?? "?";
    return WARM_CHANNELS.has(campOf(o.sponsor_campaign_id)?.channel ?? "") ? "warm/inbound" : "cold outbound";
  };
  const keyOfQual = (q: Qualification) =>
    groupBy === "campaign" ? q.sponsor_campaign_id
      : groupBy === "owner" ? brandsById.get(q.brand_id)?.owner_id ?? "?"
        : groupBy === "industry" ? brandsById.get(q.brand_id)?.industry ?? "?"
          : WARM_CHANNELS.has(campOf(q.sponsor_campaign_id)?.channel ?? "") ? "warm/inbound" : "cold outbound";

  const groups = new Map<string, Interaction[]>();
  for (const r of s.interactions) {
    const k = keyOfInteraction(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  for (const h of s.oppLatest.values()) { const k = keyOfOpp(h); if (!groups.has(k)) groups.set(k, []); }
  const plan = new Map(s.db.campaign_plan.map((p) => [p.sponsor_campaign_id, p]));
  const rows = [...groups.entries()].map(([k, I]) => {
    const brands = new Set(I.map((r) => r.brand_id));
    const replied = new Set(I.filter((r) => r.event_type === "replied").map((r) => r.brand_id));
    const positive = new Set(I.filter((r) => r.outcome === "positive" || r.event_type === "introduction_received" || r.event_type === "web_inbound").map((r) => r.brand_id));
    const met = new Set(I.filter((r) => r.event_type === "meeting_held").map((r) => r.brand_id));
    const quals = [...s.qualLatest.values()].filter((q) => keyOfQual(q) === k);
    const opps = [...s.oppLatest.values()].filter((h) => keyOfOpp(h) === k);
    const conf = opps.filter((h) => h.stage === "partner_confirmed");
    const open = opps.filter((h) => OPEN_STAGES.includes(h.stage));
    const lost = opps.filter((h) => h.stage === "lost" || h.stage === "withdrawn");
    const label = groupBy === "campaign" ? campOf(k)?.campaign_name ?? k : groupBy === "owner" ? s.owners.get(k) ?? k : k;
    const p = groupBy === "campaign" ? plan.get(k) : undefined;
    const confirmedValue = sum(conf.map((h) => h.confirmed_value_inr));
    return {
      key: k, label,
      channel: groupBy === "campaign" ? campOf(k)?.channel ?? null : null,
      owner: groupBy === "campaign" ? campOf(k)?.owner_name ?? null : null,
      brands_touched: brands.size,
      contacts_touched: new Set(I.map((r) => r.contact_id)).size,
      attempts: new Set(I.map((r) => r.attempt_id)).size,
      sends: I.filter((r) => r.event_type === "outreach_sent").length,
      brands_replied: replied.size,
      brands_positive_or_warm: positive.size,
      brands_met: met.size,
      opt_out_contacts: new Set(I.filter((r) => r.event_type === "opt_out").map((r) => r.contact_id)).size,
      qualified_brands: quals.filter((q) => q.qualification_status === "qualified").length,
      opportunities: opps.length,
      open_opportunities: open.length,
      confirmed: conf.length,
      lost_or_withdrawn: lost.length,
      confirmed_value_inr: confirmedValue,
      open_pipeline_inr: sum(open.map((h) => h.proposed_value_inr)),
      reply_rate_brand: round(pct(replied.size, brands.size)),
      meeting_rate_brand: round(pct(met.size, brands.size)),
      close_rate_brand: groupBy === "owner" ? null : round(pct(conf.length, brands.size)),
      win_rate_resolved: round(pct(conf.length, conf.length + lost.length)),
      attribution: groupBy === "owner" ? "Outreach columns (touched..met) use the interaction owner; deal columns (opportunities..value, win rate) use the latest deal owner. No rate mixes the two." : undefined,
      simulated_budget_inr: p?.budget_inr ?? null,
      simulated_hours: p?.planned_hours ?? null,
      simulated_cost_per_meeting_inr: p && met.size ? Math.round(p.budget_inr / met.size) : null,
      simulated_cost_per_confirmed_inr: p && conf.length ? Math.round(p.budget_inr / conf.length) : null,
      confirmed_value_per_hour_inr: p && p.planned_hours ? Math.round(confirmedValue / p.planned_hours) : null,
    };
  });
  return rows.sort((a, b) => b.confirmed_value_inr - a.confirmed_value_inr || b.brands_touched - a.brands_touched);
}

// ------------------------------------------------------------------ scale / change / stop
export type Verdict = "SCALE" | "CHANGE" | "STOP" | "TOO_EARLY";
export function scaleChangeStop(row: ReturnType<typeof funnelRows>[number]): { verdict: Verdict; reason: string } {
  const b = row.brands_touched;
  if (b < 8) return { verdict: "TOO_EARLY", reason: `Only ${b} brands touched; need >= 8 before judging.` };
  const close = row.close_rate_brand ?? 0;
  if (close >= 0.3) return { verdict: "SCALE", reason: `${row.confirmed}/${b} brands confirmed (${Math.round(close * 100)}% >= 30% scale threshold).` };
  if (row.confirmed === 0 && b >= 20 && row.lost_or_withdrawn + row.open_opportunities >= 5)
    return { verdict: "STOP", reason: `${b} brands, ${row.opportunities} opportunities, 0 confirmed — stop mass outreach; keep only account-based asks with a warm-intro request.` };
  if ((row.meeting_rate_brand ?? 0) < 0.1 && row.sends >= 50)
    return { verdict: "STOP", reason: `Meeting rate ${Math.round((row.meeting_rate_brand ?? 0) * 100)}% after ${row.sends} sends (< 10% stop threshold).` };
  return { verdict: "CHANGE", reason: `Close rate ${Math.round(close * 100)}% is below the 30% scale bar; fix the weakest step (${weakestStep(row).step}).` };
}

export function weakestStep(row: ReturnType<typeof funnelRows>[number]) {
  const steps = [
    { step: "touched -> replied", n: row.brands_replied, d: row.brands_touched },
    { step: "replied -> meeting", n: row.brands_met, d: Math.max(row.brands_replied, row.brands_positive_or_warm) },
    { step: "meeting -> qualified", n: row.qualified_brands, d: row.brands_met },
    { step: "opportunity -> confirmed", n: row.confirmed, d: row.opportunities },
  ].filter((x) => x.d > 0).map((x) => ({ ...x, rate: round(x.n / x.d) as number }));
  steps.sort((a, b) => a.rate - b.rate);
  return steps[0] ?? { step: "n/a", n: 0, d: 0, rate: 0 };
}

// ------------------------------------------------------------------ forecast (campaign-aware, smoothed)
const DEFAULT_STAGE_WEIGHT: Record<string, number> = { prospecting: 0.1, contacted: 0.2, proposal_sent: 0.35, negotiating: 0.6 };
export function stageWeights(s: Snapshot) {
  // For every opportunity resolved by the cutoff, which open stages did it pass through, and did it end confirmed?
  const byOpp = new Map<string, OppHistory[]>();
  for (const h of s.oppHistory) { if (!byOpp.has(h.opportunity_id)) byOpp.set(h.opportunity_id, []); byOpp.get(h.opportunity_id)!.push(h); }
  const tally = new Map<string, { won: number; n: number }>(); // keys: stage | group|stage | campaign|stage
  const add = (k: string, won: boolean) => { const t = tally.get(k) ?? { won: 0, n: 0 }; t.n++; if (won) t.won++; tally.set(k, t); };
  const groupOf = (camp: string) => (WARM_CHANNELS.has(s.campaignsById.get(camp)?.channel ?? "") ? "warm" : "cold");
  for (const [id, hs] of byOpp) {
    const last = s.oppLatest.get(id);
    if (!last || OPEN_STAGES.includes(last.stage)) continue;
    const won = last.stage === "partner_confirmed";
    const camp = s.opps.get(id)!.sponsor_campaign_id;
    for (const st of new Set(hs.map((h) => h.stage))) if (OPEN_STAGES.includes(st)) { add(st, won); add(`${groupOf(camp)}|${st}`, won); add(`${camp}|${st}`, won); }
  }
  const global: Record<string, number> = {};
  for (const st of OPEN_STAGES) {
    const t = tally.get(st);
    global[st] = t && t.n >= 5 ? t.won / t.n : DEFAULT_STAGE_WEIGHT[st];
  }
  // Hierarchical smoothing: campaign rate -> channel-group (warm/cold) rate -> all-campaign rate (k=2 pseudo-obs each level).
  const K = 2;
  const shrink = (key: string, prior: number) => { const t = tally.get(key) ?? { won: 0, n: 0 }; return (t.won + K * prior) / (t.n + K); };
  const weight = (camp: string, st: Stage) => shrink(`${camp}|${st}`, shrink(`${groupOf(camp)}|${st}`, global[st]));
  return { global, weight, tally };
}

export function forecast(s: Snapshot, scenario?: { close_ids?: string[]; drop_ids?: string[] }) {
  const { weight, global } = stageWeights(s);
  const eventStarted = s.cutoff >= ts(s.db.event[0].event_starts_at);
  const rows = [...s.oppLatest.values()].filter((h) => OPEN_STAGES.includes(h.stage)).map((h) => {
    const o = s.opps.get(h.opportunity_id)!;
    const days = Math.floor((s.cutoff - ts(h.effective_at)) / DAY);
    // Median prospecting->confirmed cycle in the source data is 10 days (5-13), so a deal idle >14 days is decaying.
    const stallFactor = days <= 14 ? 1 : days <= 28 ? 0.5 : 0.2;
    const base = weight(o.sponsor_campaign_id, h.stage);
    let w = eventStarted ? 0 : base * stallFactor;
    if (scenario?.close_ids?.includes(h.opportunity_id)) w = 1;
    if (scenario?.drop_ids?.includes(h.opportunity_id)) w = 0;
    return { opportunity_id: h.opportunity_id, brand: h.brand_name, stage: h.stage, campaign: s.campaignsById.get(o.sponsor_campaign_id)?.campaign_name, proposed_value_inr: h.proposed_value_inr, days_in_stage: days, historical_weight: round(base) as number, stall_factor: stallFactor, weight: round(w) as number, weighted_value_inr: Math.round(w * h.proposed_value_inr) };
  });
  const confirmed = [...s.oppLatest.values()].filter((h) => h.stage === "partner_confirmed");
  const expectedAdd = sum(rows.map((r) => r.weight));
  const openIds = new Set(rows.map((r) => r.opportunity_id));
  const asked = [...(scenario?.close_ids ?? []), ...(scenario?.drop_ids ?? [])];
  const ignored = asked.filter((id) => !openIds.has(id)).map((id) => ({ id, reason: s.oppLatest.has(id) ? `not open (stage ${s.oppLatest.get(id)!.stage})` : "unknown at this date" }));
  return {
    method: "Expected value of open opportunities. Weight = historical P(confirmed | reached stage) for that campaign, smoothed toward its channel group (warm/cold) and then the all-campaign stage rate (k=2 per level), using only opportunities resolved by the as-of date (no future data), x stall factor (1 if <=14 days in stage, 0.5 if 15-28, 0.2 if >28; source median cycle is 10 days). After the event has started, open deals get weight 0.",
    event_started: eventStarted,
    global_stage_weights: Object.fromEntries(Object.entries(global).map(([k, v]) => [k, round(v)])),
    confirmed_now: confirmed.length,
    scenario_applied: { close_ids: (scenario?.close_ids ?? []).filter((id) => openIds.has(id)), drop_ids: (scenario?.drop_ids ?? []).filter((id) => openIds.has(id)), ignored },
    expected_additional_confirmations: round(expectedAdd, 1) as number,
    projected_confirmed: round(confirmed.length + expectedAdd, 1) as number,
    projected_value_inr: sum(confirmed.map((h) => h.confirmed_value_inr)) + sum(rows.map((r) => r.weighted_value_inr)),
    open: rows.sort((a, b) => b.weighted_value_inr - a.weighted_value_inr),
  };
}

export function forecastBacktest(db: DB, dates: string[]) {
  const end = snapshot(db, istDate(ts(db.event[0].event_starts_at) - DAY));
  const actual = [...end.oppLatest.values()].filter((h) => h.stage === "partner_confirmed").length;
  return { actual_confirmed_at_event_eve: actual, points: dates.map((d) => { const f = forecast(snapshot(db, d)); return { as_of: d, confirmed_then: f.confirmed_now, projected: f.projected_confirmed, error: round(f.projected_confirmed - actual, 1) }; }) };
}

// ------------------------------------------------------------------ stalled deals & bottlenecks
export function stalled(s: Snapshot, days = 14) {
  return [...s.oppLatest.values()].filter((h) => OPEN_STAGES.includes(h.stage) && (s.cutoff - ts(h.effective_at)) / DAY > days)
    .map((h) => ({ opportunity_id: h.opportunity_id, brand: h.brand_name, stage: h.stage, days_in_stage: Math.floor((s.cutoff - ts(h.effective_at)) / DAY), proposed_value_inr: h.proposed_value_inr, owner: h.owner_name, campaign: s.campaignsById.get(s.opps.get(h.opportunity_id)!.sponsor_campaign_id)?.campaign_name }))
    .sort((a, b) => b.proposed_value_inr - a.proposed_value_inr);
}

export function bottlenecks(s: Snapshot) {
  const rows = funnelRows(s, "campaign");
  const st = stalled(s);
  return {
    by_campaign: rows.map((r) => ({ campaign: r.label, ...scaleChangeStop(r), weakest_step: weakestStep(r), open_pipeline_inr: r.open_pipeline_inr })),
    stalled_open_opportunities: { count: st.length, value_inr: sum(st.map((x) => x.proposed_value_inr)), by_stage: st.reduce<Record<string, number>>((a, x) => ((a[x.stage] = (a[x.stage] ?? 0) + 1), a), {}) },
  };
}

// ------------------------------------------------------------------ cash (SIMULATED payments layer)
/** A payment as it looked at the cutoff: receipts / voids after the cutoff are hidden (no look-ahead). */
export function paymentAsOf(p: Payment, cutoff: number) {
  const received = p.received_at !== null && ts(p.received_at) <= cutoff;
  const voided = !!p.voided_at && ts(p.voided_at) <= cutoff;
  return { ...p, received_at: received ? p.received_at : null, net_received_inr: received ? p.net_received_inr : 0, voided_at: voided ? p.voided_at ?? null : null, received_as_of: received, status_as_of: voided ? "void" : received ? "received" : ts(p.due_at) < cutoff ? "overdue" : "open" };
}
export function cashCollection(s: Snapshot) {
  const P = s.db.payments.filter((p) => ts(p.invoiced_at) <= s.cutoff && !(p.voided_at && ts(p.voided_at) <= s.cutoff));
  const recv = (p: Payment) => p.received_at !== null && ts(p.received_at) <= s.cutoff;
  const ev = s.db.event[0];
  const t14 = eodIST(istDate(ts(ev.event_starts_at) - 14 * DAY)); // whole T-14 day counts
  const overdue = P.filter((p) => !recv(p) && ts(p.due_at) < s.cutoff);
  return {
    is_simulated: true,
    note: "Payments are SIMULATED (the source dataset has no bank-receipt data). Policy modelled: 50% advance at confirmation, balance invoiced +7 days, 2% TDS deducted. Confirming a cash deal in the app creates its invoices; moving it out of confirmed voids unpaid ones.",
    totals: {
      invoiced_gross_inr: sum(P.map((p) => p.amount_inr)),
      received_net_inr: sum(P.filter(recv).map((p) => p.net_received_inr)),
      tds_withheld_inr: sum(P.filter(recv).map((p) => p.tds_inr)),
      outstanding_gross_inr: sum(P.filter((p) => !recv(p)).map((p) => p.amount_inr)),
      overdue_count: overdue.length,
      overdue_gross_inr: sum(overdue.map((p) => p.amount_inr)),
      received_net_by_T14_inr: sum(P.filter((p) => p.received_at && ts(p.received_at) <= Math.min(t14, s.cutoff)).map((p) => p.net_received_inr)),
      t14_date: istDate(t14),
      is_simulated: true,
    },
    overdue: overdue.map((p) => ({ payment_id: p.payment_id, opportunity_id: p.opportunity_id, brand: s.db.brands.find((b) => b.brand_id === p.brand_id)?.brand_name, installment: p.installment, amount_inr: p.amount_inr, due: p.due_at.slice(0, 10) })),
  };
}

// ------------------------------------------------------------------ time series (weekly snapshots)
export function weeklySeries(db: DB, asOf: string) {
  const start = db.event[0].history_start.slice(0, 10);
  const out: { date: string; qualified: number; confirmed: number; confirmed_value_inr: number; cash_received_net_inr: number; goal_confirmed: number; goal_qualified: number }[] = [];
  let d = eodIST(start);
  const end = eodIST(asOf);
  while (d <= end + 6 * DAY) {
    const date = istDate(Math.min(d, end));
    const s = snapshot(db, date);
    const conf = [...s.oppLatest.values()].filter((h) => h.stage === "partner_confirmed");
    out.push({
      date,
      qualified: [...s.qualLatest.values()].filter((q) => q.qualification_status === "qualified").length,
      confirmed: conf.length,
      confirmed_value_inr: sum(conf.map((h) => h.confirmed_value_inr)),
      cash_received_net_inr: cashCollection(s).totals.received_net_inr,
      goal_confirmed: s.target.confirmed_partnerships_goal,
      goal_qualified: s.target.qualified_brands_goal,
    });
    if (d >= end) break;
    d = Math.min(d + 7 * DAY, end);
  }
  return out;
}

// ------------------------------------------------------------------ entity views
export function opportunityList(s: Snapshot, f: { stage?: string; campaign?: string; owner?: string; support_type?: string; min_value?: number; brand?: string; open_only?: boolean } = {}) {
  const lc = (x?: string | null) => (x ?? "").toLowerCase();
  return [...s.oppLatest.values()].map((h) => {
    const o = s.opps.get(h.opportunity_id)!;
    const c = s.campaignsById.get(o.sponsor_campaign_id);
    return { opportunity_id: h.opportunity_id, brand: h.brand_name, brand_id: h.brand_id, stage: h.stage, proposed_value_inr: h.proposed_value_inr, confirmed_value_inr: h.confirmed_value_inr, support_type: o.support_type, campaign: c?.campaign_name ?? o.originating_campaign_name, sponsor_campaign_id: o.sponsor_campaign_id, channel: c?.channel, owner: h.owner_name, owner_id: h.owner_id, last_change: h.effective_at, days_in_stage: Math.floor((s.cutoff - ts(h.effective_at)) / DAY), created_at: o.created_at };
  }).filter((r) =>
    (!f.stage || r.stage === f.stage) &&
    (!f.campaign || lc(r.campaign).includes(lc(f.campaign)) || r.sponsor_campaign_id === f.campaign) &&
    (!f.owner || lc(r.owner).includes(lc(f.owner)) || r.owner_id === f.owner) &&
    (!f.support_type || r.support_type === f.support_type) &&
    (!f.brand || lc(r.brand).includes(lc(f.brand))) &&
    (f.min_value === undefined || r.proposed_value_inr >= f.min_value) &&
    (!f.open_only || OPEN_STAGES.includes(r.stage as Stage)),
  ).sort((a, b) => b.proposed_value_inr - a.proposed_value_inr);
}

export function findBrands(db: DB, q: string) {
  const lc = q.toLowerCase().trim();
  return db.brands.filter((b) => b.brand_id.toLowerCase() === lc || b.brand_name.toLowerCase() === lc)
    .concat(db.brands.filter((b) => b.brand_name.toLowerCase().includes(lc) && b.brand_name.toLowerCase() !== lc && b.brand_id.toLowerCase() !== lc));
}

export function brandDetail(s: Snapshot, brandId: string) {
  const b = s.db.brands.find((x) => x.brand_id === brandId);
  if (!b) return null;
  const I = s.interactions.filter((r) => r.brand_id === brandId).sort((a, c) => ts(a.occurred_at) - ts(c.occurred_at));
  const optedOut = new Set(I.filter((r) => r.event_type === "opt_out").map((r) => r.contact_id));
  const quals = dedupe(s.db.qualification, "history_id").rows.filter((q) => q.brand_id === brandId && ts(q.effective_at) <= s.cutoff).sort((a, c) => ts(a.effective_at) - ts(c.effective_at));
  const opps = opportunityList(s).filter((o) => o.brand_id === brandId).map((o) => ({ ...o, history: s.oppHistory.filter((h) => h.opportunity_id === o.opportunity_id).sort((a, c) => ts(a.effective_at) - ts(c.effective_at)).map((h) => ({ stage: h.stage, at: h.effective_at, proposed: h.proposed_value_inr, confirmed: h.confirmed_value_inr })) }));
  return {
    brand: b,
    visible_as_of: s.brandsVisible.has(brandId),
    contacts: s.db.contacts.filter((c) => c.brand_id === brandId && ts(c.created_at) <= s.cutoff).map((c) => ({ ...c, opted_out: optedOut.has(c.contact_id) })),
    current_qualification: s.qualLatest.get(brandId) ?? null,
    qualification_history: quals.map((q) => ({ status: q.qualification_status, reason: q.reason, at: q.effective_at, source_campaign: q.source_campaign_name })),
    interactions: I.map((r) => ({ at: r.occurred_at, campaign: r.campaign_name, event: r.event_type, outcome: r.outcome, contact: r.contact_name, attempt_id: r.attempt_id })),
    opportunities: opps,
    payments_simulated: s.db.payments.filter((p) => p.brand_id === brandId && ts(p.invoiced_at) <= s.cutoff).map((p) => paymentAsOf(p, s.cutoff)),
    activations: s.db.activations.filter((a) => a.brand_id === brandId && ts(a.linked_at) <= s.cutoff),
    tasks: s.db.tasks.filter((t) => t.brand_id === brandId),
  };
}

export function taskView(s: Snapshot, f: { status?: string; owner?: string; overdue_only?: boolean } = {}) {
  return s.db.tasks.map((t: Task) => ({
    ...t, owner_name: t.owner_id ? s.owners.get(t.owner_id) ?? t.owner_id : null,
    overdue: t.status !== "done" && !!t.due_date && eodIST(t.due_date) < s.cutoff,
  })).filter((t) => (!f.status || t.status === f.status) && (!f.owner || t.owner_id === f.owner || (t.owner_name ?? "").toLowerCase().includes(f.owner.toLowerCase())) && (!f.overdue_only || t.overdue))
    .sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) || (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
}

export function ownerRows(s: Snapshot) {
  const rows = funnelRows(s, "owner");
  const tasks = taskView(s);
  return rows.map((r) => ({
    ...r,
    brands_owned: s.db.brands.filter((b) => b.owner_id === r.key && s.brandsVisible.has(b.brand_id)).length,
    open_tasks: tasks.filter((t) => t.owner_id === r.key && t.status !== "done").length,
    overdue_tasks: tasks.filter((t) => t.owner_id === r.key && t.overdue).length,
  }));
}

// ------------------------------------------------------------------ data dictionary (what the data can / cannot answer)
export function dataDictionary(db: DB) {
  return {
    source_tables: Object.fromEntries((["event", "targets", "brands", "contacts", "campaigns", "interactions", "qualification", "opportunities", "opp_history", "activations"] as const).map((t) => [t, db[t].length])),
    app_tables: { campaign_plan: db.campaign_plan.length, payments: db.payments.length, tasks: db.tasks.length },
    simulated: [
      "campaign_plan.budget_inr / planned_hours — SIMULATED: the source has no spend or effort data.",
      "payments — SIMULATED invoices/receipts: the source has no bank-receipt data; confirmed_value_inr is not cash.",
    ],
    not_available: [
      "Actual cash received / bank receipts (only simulated).",
      "Real marketing spend, CAC or ROI per sponsorship campaign (only simulated budgets).",
      "Causal impact of sponsor activations on attendees (activations are associations only).",
      "Sponsor satisfaction, renewal intent, deliverables fulfilment, contract terms, GST/TDS actually deducted.",
      "Reasons for lost/withdrawn deals beyond the stage label.",
      "Attendee counts/footfall (separate attendee dataset is not loaded).",
      `Anything after the history window (${db.event[0]?.history_end?.slice(0, 10)}) except edits made in this app.`,
    ],
    key_definitions: {
      qualified_brands: "Brands whose LATEST qualification version (<= as-of) is 'qualified'.",
      confirmed_partnerships: "Opportunities whose LATEST stage version (<= as-of) is 'partner_confirmed'. A brand can have >1 opportunity.",
      confirmed_value: "Reported partnership value in INR incl. in-kind; NOT cash collected.",
      as_of: "End of the selected day in Asia/Kolkata; later events are invisible.",
      dedup: "Rows repeating the same interaction_id/history_id are import retries and counted once.",
    },
    field_guide: db.field_guide,
    readme: db.readme,
  };
}
