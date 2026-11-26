import { describe, expect, it } from "vitest";
import seed from "../data/seed.json";
import type { DB } from "../lib/types";
import { snapshot, kpis, funnelRows, scaleChangeStop, forecast, cashCollection, stalled, brandDetail, findBrands, weeklySeries } from "../lib/metrics";

const db = seed as unknown as DB;

describe("dedup + end state (pinned to pandas-verified numbers)", () => {
  const s = snapshot(db, "2025-04-20");
  const k = kpis(s);
  it("removes import-retry duplicates", () => {
    expect(s.dedup).toEqual({ interactions: 3, qualification: 1, opp_history: 2 });
    expect(s.interactions.length).toBe(950);
  });
  it("headline KPIs", () => {
    expect(k.qualified_brands).toBe(60);
    expect(k.confirmed_partnerships).toBe(24);
    expect(k.confirmed_value_inr).toBe(2_240_000);
    expect(k.confirmed_cash_type_value_inr).toBe(2_000_000);
    expect(k.confirmed_in_kind_value_inr).toBe(240_000);
    expect(k.open_opportunities).toBe(26);
    expect(k.open_pipeline_proposed_inr).toBe(1_440_000);
    expect(k.lost_or_withdrawn).toBe(8);
    expect(k.targets).toEqual({ qualified_brands_goal: 55, confirmed_partnerships_goal: 28 });
    expect(k.opt_out_contacts).toBe(7);
  });
  it("campaign funnel: warm channels carry all confirmed value", () => {
    const rows = Object.fromEntries(funnelRows(s, "campaign").map((r) => [r.label, r]));
    expect(rows["Brand Discovery Email"].brands_touched).toBe(91);
    expect(rows["Brand Discovery Email"].confirmed).toBe(0);
    expect(rows["Creator Network Referrals"].confirmed).toBe(9);
    expect(rows["Creator Network Referrals"].confirmed_value_inr).toBe(785_000);
    expect(rows["Partner Interest Form"].confirmed_value_inr).toBe(670_000);
    expect(rows["Warm Partner Introductions"].confirmed).toBe(8);
    expect(scaleChangeStop(rows["Brand Discovery Email"]).verdict).toBe("STOP");
    expect(scaleChangeStop(rows["Creator Network Referrals"]).verdict).toBe("SCALE");
    const grp = Object.fromEntries(funnelRows(s, "channel_group").map((r) => [r.label, r]));
    expect(grp["warm/inbound"].confirmed).toBe(24);
    expect(grp["cold outbound"].confirmed).toBe(0);
  });
});

describe("point-in-time snapshots never leak later outcomes", () => {
  const cases: [string, number, number, number][] = [
    ["2025-02-15", 24, 2, 170_000],
    ["2025-03-01", 40, 10, 915_000],
    ["2025-03-15", 55, 17, 1_505_000],
    ["2025-04-01", 60, 23, 2_090_000],
  ];
  for (const [d, q, c, v] of cases) {
    it(d, () => {
      const k = kpis(snapshot(db, d));
      expect(k.qualified_brands).toBe(q);
      expect(k.confirmed_partnerships).toBe(c);
      expect(k.confirmed_value_inr).toBe(v);
    });
  }
  it("Cobalt Learning counts as confirmed on 1 Mar but not after its 20 Mar withdrawal", () => {
    const early = snapshot(db, "2025-03-01").oppLatest.get("O006")!;
    const late = snapshot(db, "2025-03-20").oppLatest.get("O006")!;
    expect(early.stage).toBe("partner_confirmed");
    expect(late.stage).toBe("withdrawn");
  });
  it("targets switch to the revised plan on 15 Mar", () => {
    expect(snapshot(db, "2025-03-14").target.confirmed_partnerships_goal).toBe(20);
    expect(snapshot(db, "2025-03-15").target.confirmed_partnerships_goal).toBe(28);
  });
});

describe("forecast, cash and entities", () => {
  const s = snapshot(db, "2025-04-20");
  it("cold-channel pipeline gets low historical weights (no historical closes)", () => {
    const f = forecast(snapshot(db, "2025-04-01"));
    const cold = f.open.filter((o) => ["Brand Discovery Email", "Brand Leader LinkedIn", "Past Conversation Revival"].includes(o.campaign!));
    expect(cold.length).toBeGreaterThan(20);
    expect(Math.max(...cold.map((o) => o.historical_weight))).toBeLessThan(0.5);
  });
  it("after the event starts, open deals cannot add confirmations", () => {
    const f = forecast(s);
    expect(f.event_started).toBe(true);
    expect(f.projected_confirmed).toBe(24);
  });
  it("mid-campaign projection is between actual and a reachable ceiling", () => {
    const f = forecast(snapshot(db, "2025-03-15"));
    expect(f.projected_confirmed).toBeGreaterThan(17);
    expect(f.projected_confirmed).toBeLessThan(17 + f.open.length);
  });
  it("scenario: force-closing negotiating deals raises the projection deterministically", () => {
    const s2 = snapshot(db, "2025-04-01");
    const ids = forecast(s2).open.filter((o) => o.stage === "negotiating").map((o) => o.opportunity_id);
    const f = forecast(s2, { close_ids: ids });
    expect(f.projected_confirmed).toBeGreaterThanOrEqual(23 + ids.length);
  });
  it("simulated cash is always <= confirmed cash-type value", () => {
    const c = cashCollection(s).totals;
    expect(c.received_net_inr).toBeLessThanOrEqual(2_000_000);
    expect(c.invoiced_gross_inr).toBe(2_000_000);
  });
  it("stalled deals are the cold-channel ones", () => {
    expect(stalled(s).length).toBe(26);
  });
  it("brand lookup + detail", () => {
    const b = findBrands(db, "beardo")[0];
    const d = brandDetail(s, b.brand_id)!;
    expect(d.opportunities.length).toBe(2);
    expect(d.activations.length).toBe(1);
  });
  it("weekly series ends at the as-of values", () => {
    const w = weeklySeries(db, "2025-04-20");
    expect(w.at(-1)!.confirmed).toBe(24);
    expect(w[0].date).toBe("2025-01-15");
  });
});
