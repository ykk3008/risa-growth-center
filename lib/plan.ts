/**
 * 2027 plan: the SINGLE source of truth for bet thresholds, tests and pacing gates
 * (used by the Plan page, the live bet-signal engine in lib/bets.ts, the copilot and the slides).
 * Threshold rule: SCALE at >= 120% of the plan rate, STOP below 70% of plan, otherwise CHANGE; TOO_EARLY below a minimum n.
 */
import model from "@/data/model_output.json";

export type Rule = { metric: string; plan: number; scale: number; stop: number; unit: "%" | "per_week" | "lakh" | "count"; min_n: number };
export interface BetPlan {
  critical: string; risk: string; leading: string;
  rules: Rule[];
  scale_action: string; change_action: string; stop_action: string;
  test: { hypothesis: string; unit: string; n_per_arm: number; metric: string; mde: string; read: string; decision: string };
  dashboard: string; ask_copilot: string;
}

const W = model.channels["Warm intro"].base;            // [meet, prop, mou]
const IN = model.channels["Inbound / sponsor store"].base;
const segB = model.base.segments.find((s) => s.key === "B")!;
const segA = model.base.segments.find((s) => s.key === "A")!;
const warmProspects = model.base.segments.reduce((a, s) => a + s.lines.filter((l) => l.channel === "Warm intro").reduce((x, l) => x + l.prospects, 0), 0);
const inboundProspects = model.base.segments.reduce((a, s) => a + s.lines.filter((l) => l.channel === "Inbound / sponsor store").reduce((x, l) => x + l.prospects, 0), 0);
const WEEKS_SELLING = 11;
const r1 = (x: number) => Math.round(x * 10) / 10;

export const BET_PLANS: Record<string, BetPlan> = {
  warm: {
    critical: "Intro volume and intro to meeting rate",
    risk: "Referrer fatigue; intros land with the wrong decision maker",
    leading: `Intros per week (plan ${r1(warmProspects / WEEKS_SELLING)}); intro to meeting within 7 days (plan ${W[0] * 100}%)`,
    rules: [
      { metric: "intros_per_week", plan: r1(warmProspects / WEEKS_SELLING), scale: r1((warmProspects / WEEKS_SELLING) * 1.2), stop: r1((warmProspects / WEEKS_SELLING) * 0.7), unit: "per_week", min_n: 20 },
      { metric: "intro_to_meeting", plan: W[0], scale: r1(W[0] * 1.2 * 100) / 100, stop: r1(W[0] * 0.7 * 100) / 100, unit: "%", min_n: 20 },
    ],
    scale_action: "Move cold ABM hours here; add alumni and creator events",
    change_action: "Tighten the ask: copilot-made ROI one-pager per brand, named decision maker",
    stop_action: "Re-source referrers (wrong network); keep only top referrers",
    test: { hypothesis: "A personalised ROI one-pager lifts intro to meeting vs the generic deck", unit: "Warm intro (brand)", n_per_arm: 60, metric: "Meeting held within 7 days", mde: "+25 pts (40% to 65%) at 80% power", read: "Week 6", decision: "Winner becomes the default pitch for all sellers" },
    dashboard: "Campaigns: warm rows, verdict and weakest step; Plan: live bet signals", ask_copilot: "Which warm referrers convert to meetings, and who should get more intros?",
  },
  store: {
    critical: "Inbound submits and speed to first meeting",
    risk: "Many small tickets swamp a small team",
    leading: `Submits per week (plan ${r1(inboundProspects / WEEKS_SELLING)}); submit to meeting within 5 days (plan ${IN[0] * 100}%); share paid upfront`,
    rules: [
      { metric: "submits_per_week", plan: r1(inboundProspects / WEEKS_SELLING), scale: r1((inboundProspects / WEEKS_SELLING) * 1.2), stop: r1((inboundProspects / WEEKS_SELLING) * 0.7), unit: "per_week", min_n: 15 },
      { metric: "submit_to_meeting", plan: IN[0], scale: r1(IN[0] * 1.2 * 100) / 100, stop: r1(IN[0] * 0.7 * 100) / 100, unit: "%", min_n: 15 },
    ],
    scale_action: "Paid promotion of the store + second seller",
    change_action: "Rework packages and pricing page; push via campus ambassadors",
    stop_action: "Fold store effort into the warm engine",
    test: { hypothesis: "Bonus inventory for 100% upfront payment lifts upfront payment vs 50/50 terms", unit: "Inbound brand reaching proposal", n_per_arm: 36, metric: "Paid 100% within 7 days of MoU", mde: "+30 pts (50% to 80%) at 80% power", read: "Week 6", decision: "Adopt the winning terms for every category package" },
    dashboard: "Campaigns: Partner Interest Form row; Data: payments (simulated)", ask_copilot: "How fast are inbound brands getting a first meeting, and how many paid upfront?",
  },
  verticals: {
    critical: "Live proposals per vertical title and average ticket",
    risk: "Cannibalises the anchor title; sponsor clutter at nights",
    leading: `Verticals with 2 or more live proposals by week 5 (plan ${segB.slots} slots); average ask (plan ₹${segB.avg_deal_lakh}L)`,
    rules: [
      { metric: "avg_ask_lakh", plan: segB.avg_deal_lakh, scale: r1(segB.avg_deal_lakh * 1.2), stop: r1(segB.avg_deal_lakh * 0.7), unit: "lakh", min_n: 5 },
    ],
    scale_action: "Open 2 more verticals (stretch = 8)",
    change_action: "Re-bundle two weak verticals into one package",
    stop_action: "No proposal after 15 pitches: sell that inventory as category slots",
    test: { hypothesis: "A ₹7L ask does not lower proposal to MoU vs a ₹5L ask", unit: "Vertical prospect, matched by category", n_per_arm: 20, metric: "Proposal to MoU and ₹ per proposal", mde: "Directional only (54 per arm needed for +26 pts)", read: "Week 7", decision: "Price the remaining verticals at the higher ask unless MoU rate drops >10 pts" },
    dashboard: "Pipeline: kanban + forecast weights per deal", ask_copilot: "Which vertical titles have live proposals, and what is the average ask?",
  },
  anchor: {
    critical: "Exec-level access at fintech/UPI/bank anchors",
    risk: "8 to 14 week approval chains; all-or-nothing",
    leading: `Anchors at proposal by week 6 (plan ${r1(segA.deals)} signed from 3 slots)`,
    rules: [
      { metric: "anchors_at_proposal_wk6", plan: 2, scale: 3, stop: 1, unit: "count", min_n: 1 },
    ],
    scale_action: "Full title push with CEO/alumni escalation",
    change_action: "Re-price to co-title (₹12-13L) and widen to 2 slots",
    stop_action: "No MoU by week 9: release slots as vertical titles (bet 3)",
    test: { hypothesis: "A title ask (₹20L) earns more ₹ per pitched anchor than a co-title ask (₹12L)", unit: "Anchor account, matched by category", n_per_arm: 25, metric: "₹ signed per pitched anchor", mde: "Directional only (about 50 per arm needed)", read: "Week 6", decision: "Shift remaining anchors to the better ask" },
    dashboard: "Pipeline: negotiating column, days in stage, stalled-deal alert", ask_copilot: "Which anchor deals are stalled, and what is the forecast if they close?",
  },
  hybrid: {
    critical: "Share of the fee guaranteed upfront",
    risk: "Cash arrives after the fest; attribution disputes; DPDP consent",
    leading: "Guaranteed share in signed pilots (plan 50%); consented opt-in rate",
    rules: [
      { metric: "guaranteed_share", plan: 0.5, scale: 0.6, stop: 0.35, unit: "%", min_n: 2 },
    ],
    scale_action: "Offer hybrid to every category partner that refused a fixed fee",
    change_action: "Lower the bonus cap, raise the base fee",
    stop_action: "Sponsors accept only pure CPA: drop (no pre-fest cash)",
    test: { hypothesis: "A hybrid offer converts brands that declined a fixed fee", unit: "Brand that declined a fixed fee", n_per_arm: 30, metric: "Signed with at least 50% guaranteed", mde: "Pilot, no control arm", read: "Week 6", decision: "Scale only if 2 pilots sign at 60% guaranteed or more" },
    dashboard: "Data: payments (simulated) — guaranteed vs bonus", ask_copilot: "How much hybrid cash is guaranteed before T-14?",
  },
};

const G = model.gates;
export const GLOBAL_GATES = [
  { gate: "Week 4", rule: "3 anchors in active conversation", miss: "below 3", action: "Move cold ABM hours to warm intros" },
  { gate: "Week 6", rule: `Signed MoU value ₹${G.week6_signed_plan_lakh}L (${Math.round(G.week6_signed_share * 100)}% of base)`, miss: `below ₹${G.week6_signed_gate_lakh}L`, action: "Cut cold ABM, re-price anchor to co-title" },
  { gate: "Week 9", rule: `Cash in bank ₹${G.week9_cash_plan_lakh}L`, miss: `below ₹${G.week9_cash_gate_lakh}L`, action: "100% advance on every new deal; escalate overdue balances" },
  { gate: "T-21", rule: "All balances invoiced; MoU to bank receipt within 15 days", miss: "over 20% overdue", action: "Owner-level chase tasks + sponsor exec escalation" },
  { gate: "T-14", rule: `Cash in bank ₹${G.t14_cash_plan_lakh}L (base)`, miss: "below plan", action: "Headline artist spend only from cash already banked" },
];

export function plan2027() {
  return {
    fest: model.fest,
    status_quo_cash_lakh: model.status_quo_cash_by_T14_lakh,
    uplift: model.uplift,
    base: { cash_lakh: model.base.cash_by_T14_lakh, signed_lakh: model.base.signed_value_lakh, deals: model.base.deals, prospects: model.base.prospects, utilisation: model.base.utilisation, segments: model.base.segments.map((s) => ({ segment: s.segment, deals: s.deals, signed_lakh: s.signed_value_lakh, cash_lakh: s.cash_by_T14_lakh })) },
    stretch: { cash_lakh: model.stretch.cash_by_T14_lakh, signed_lakh: model.stretch.signed_value_lakh, deals: model.stretch.deals, prospects: model.stretch.prospects, utilisation: model.stretch.utilisation },
    uncertainty: model.monte_carlo,
    sensitivities: model.sensitivities,
    bets: model.bets.map((b) => ({ ...b, plan: BET_PLANS[b.key] })),
    gates: GLOBAL_GATES,
    note: "2027 plan figures are MODEL PROJECTIONS (2025 dataset rates haircut toward public benchmarks + labelled estimates), not actuals.",
  };
}
