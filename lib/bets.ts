/**
 * Live bet signals: applies the 2027 thresholds in lib/plan.ts to measurable proxies in the live data.
 * Proxies: warm engine = Warm Partner Introductions (SC02) + Creator Network Referrals (SC05);
 *          sponsor store = Partner Interest Form (SC04). Verticals / anchor / hybrid are 2027 concepts
 *          with no tagged deals in the source data, so they report NOT_MEASURABLE instead of guessing.
 */
import { Snapshot, ts, DAY } from "./metrics";
import { BET_PLANS, Rule } from "./plan";

export type Signal = "SCALE" | "CHANGE" | "STOP" | "TOO_EARLY" | "NOT_MEASURABLE";
const PROXIES: Record<string, string[]> = { warm: ["SC02", "SC05"], store: ["SC04"] };

function judge(rule: Rule, value: number, n: number): Signal {
  if (n < rule.min_n) return "TOO_EARLY";
  if (value >= rule.scale) return "SCALE";
  if (value < rule.stop) return "STOP";
  return "CHANGE";
}

export function betSignals(s: Snapshot) {
  const out = [];
  for (const [key, plan] of Object.entries(BET_PLANS)) {
    const camps = PROXIES[key];
    if (!camps) {
      out.push({ bet: key, signal: "NOT_MEASURABLE" as Signal, reason: "No deals in the source data are tagged to this 2027 bet; it becomes measurable once its opportunities are tagged.", metrics: [] });
      continue;
    }
    const I = s.interactions.filter((r) => camps.includes(r.sponsor_campaign_id));
    const brands = new Set(I.map((r) => r.brand_id));
    const met = new Set(I.filter((r) => r.event_type === "meeting_held").map((r) => r.brand_id));
    const start = Math.min(...camps.map((c) => ts(s.campaignsById.get(c)!.planned_start_at)));
    const weeks = Math.max(1, (s.cutoff - start) / (7 * DAY));
    const values: Record<string, number> = {
      intros_per_week: brands.size / weeks, submits_per_week: brands.size / weeks,
      intro_to_meeting: brands.size ? met.size / brands.size : 0, submit_to_meeting: brands.size ? met.size / brands.size : 0,
    };
    const metrics = plan.rules.map((r) => {
      const v = values[r.metric];
      return { metric: r.metric, value: Math.round(v * 100) / 100, plan: r.plan, scale_at: r.scale, stop_below: r.stop, n: brands.size, signal: judge(r, v, brands.size) };
    });
    const sigs = metrics.map((m) => m.signal);
    const signal: Signal = sigs.every((x) => x === "TOO_EARLY") ? "TOO_EARLY" : sigs.includes("STOP") ? "STOP" : sigs.every((x) => x === "SCALE") ? "SCALE" : "CHANGE";
    const action = signal === "SCALE" ? plan.scale_action : signal === "STOP" ? plan.stop_action : signal === "CHANGE" ? plan.change_action : "Wait for the minimum sample";
    out.push({ bet: key, proxy_campaigns: camps, signal, action, weeks_elapsed: Math.round(weeks * 10) / 10, brands: brands.size, metrics,
      reason: metrics.map((m) => `${m.metric} ${m.value} vs scale ${m.scale_at} / stop ${m.stop_below} -> ${m.signal}`).join("; ") });
  }
  return { as_of: s.asOf, rule: "SCALE if >= 120% of plan on every metric; STOP if any metric < 70% of plan; TOO_EARLY below the minimum n; otherwise CHANGE. Thresholds come from the 2027 model (lib/plan.ts).", bets: out };
}
