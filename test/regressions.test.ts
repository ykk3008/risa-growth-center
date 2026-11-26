// Regression tests for issues found in the adversarial review.
import { describe, expect, it } from "vitest";
import seed from "../data/seed.json";
import type { DB } from "../lib/types";
import { snapshot, brandDetail, paymentAsOf, forecast, cashCollection, parseAsOf, ts, funnelRows } from "../lib/metrics";
import { runTool, queryRecords } from "../lib/copilot/tools";
import { betSignals } from "../lib/bets";
import { BET_PLANS, GLOBAL_GATES } from "../lib/plan";

const db = seed as unknown as DB;

describe("owners", () => {
  it("T03 Meera Iyer (deal owner only) is a valid task owner", () => {
    expect(snapshot(db).owners.get("T03")).toBe("Meera Iyer");
    const r = runTool(db, "propose_task", { title: "x", owner_id: "T03", rationale: "y" }, "2025-04-20");
    expect(r.proposal?.warnings).toEqual([]);
  });
  it("owner funnel never mixes attribution rules into one rate", () => {
    for (const r of funnelRows(snapshot(db), "owner")) expect(r.close_rate_brand).toBeNull();
  });
});

describe("as-of validation and leakage", () => {
  it("rejects malformed dates instead of silently using a default", () => {
    expect(parseAsOf("2025-02-30")).toBeNull();
    expect(parseAsOf("15 March")).toBeNull();
    const r = runTool(db, "get_kpis", { as_of: "2025-13-01" }, "2025-04-20").result as { error?: string };
    expect(r.error).toMatch(/Invalid as_of/);
    const c = runTool(db, "compare_dates", { date_a: "March", date_b: "2025-03-15" }, "2025-04-20").result as { error?: string };
    expect(c.error).toBeTruthy();
  });
  it("brand detail hides contacts created after the cutoff", () => {
    const s = snapshot(db, "2025-02-01");
    for (const b of db.brands.slice(0, 40)) {
      const d = brandDetail(s, b.brand_id)!;
      for (const c of d.contacts) expect(ts(c.created_at)).toBeLessThanOrEqual(s.cutoff);
    }
  });
  it("payments received after the cutoff look unpaid at the cutoff", () => {
    const p = db.payments.find((x) => x.received_at)!;
    const before = paymentAsOf(p, ts(p.received_at!) - 1000);
    expect(before.received_at).toBeNull();
    expect(before.net_received_inr).toBe(0);
  });
  it("T-14 counts the whole T-14 day", () => {
    const c = cashCollection(snapshot(db, "2025-04-20")).totals;
    expect(c.t14_date).toBe("2025-03-29");
  });
});

describe("query_records semantics", () => {
  const s = snapshot(db, "2025-04-20");
  it("a date filter covers the whole IST day", () => {
    const on = queryRecords(s, { table: "interactions", filters: [{ field: "occurred_at", op: "eq", value: "2025-03-06" }], aggregate: "count" }) as { value: number };
    const lte = queryRecords(s, { table: "interactions", filters: [{ field: "occurred_at", op: "lte", value: "2025-03-06" }], aggregate: "count" }) as { value: number };
    const lt = queryRecords(s, { table: "interactions", filters: [{ field: "occurred_at", op: "lt", value: "2025-03-06" }], aggregate: "count" }) as { value: number };
    expect(on.value).toBeGreaterThan(0);
    expect(lte.value - lt.value).toBe(on.value);
  });
  it("numbers compare numerically, 'in' accepts a comma list", () => {
    const big = queryRecords(s, { table: "opportunities", filters: [{ field: "proposed_value_inr", op: "gte", value: "100000" }], aggregate: "count" }) as { value: number };
    expect(big.value).toBeGreaterThan(0);
    const inn = queryRecords(s, { table: "opportunities", filters: [{ field: "stage", op: "in", value: "lost,withdrawn" }], aggregate: "count" }) as { value: number };
    expect(inn.value).toBe(8);
  });
  it("unknown group_by / sort / aggregate field returns an error, not a wrong number", () => {
    expect((queryRecords(s, { table: "brands", group_by: ["revenue"] }) as { error?: string }).error).toMatch(/Unknown field/);
    expect((queryRecords(s, { table: "brands", aggregate: "sum" }) as { error?: string }).error).toMatch(/needs a 'field'/);
  });
});

describe("forecast what-if and bets", () => {
  it("reports ignored scenario ids", () => {
    const f = forecast(snapshot(db, "2025-04-01"), { close_ids: ["O001", "NOPE"] });
    expect(f.scenario_applied.ignored.map((x) => x.id).sort()).toEqual(["NOPE", "O001"]);
  });
  it("bet signals apply plan thresholds to warm/store proxies and refuse to guess the rest", () => {
    const b = betSignals(snapshot(db, "2025-04-20"));
    const by = Object.fromEntries(b.bets.map((x) => [x.bet, x]));
    expect(["SCALE", "CHANGE", "STOP"]).toContain(by.warm.signal);
    expect(by.anchor.signal).toBe("NOT_MEASURABLE");
    expect(Object.keys(BET_PLANS).sort()).toEqual(["anchor", "hybrid", "store", "verticals", "warm"]);
    expect(GLOBAL_GATES.length).toBe(5);
  });
});
