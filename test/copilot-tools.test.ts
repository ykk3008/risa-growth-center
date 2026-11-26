import { describe, expect, it } from "vitest";
import seed from "../data/seed.json";
import type { DB } from "../lib/types";
import { evaluate } from "../lib/copilot/calc";
import { runTool, queryRecords } from "../lib/copilot/tools";
import { snapshot } from "../lib/metrics";

const db = seed as unknown as DB;

describe("calculate", () => {
  it("does exact arithmetic", () => {
    expect(evaluate("24 / 28 * 100")).toBeCloseTo(85.714286, 5);
    expect(evaluate("round(2240000 / 24, 0)")).toBe(93333);
    expect(evaluate("max(3, 7) - min(2, 5) + 2^3")).toBe(13);
    expect(evaluate("-(4 - 10) * 1.5")).toBe(9);
  });
  it("rejects code", () => {
    expect(() => evaluate("process.exit()")).toThrow();
    expect(() => evaluate("1/0")).toThrow();
  });
});

describe("query_records", () => {
  const s = snapshot(db, "2025-04-20");
  it("counts distinct brands per industry among confirmed opportunities", () => {
    const r = queryRecords(s, { table: "opportunities", filters: [{ field: "stage", op: "eq", value: "partner_confirmed" }], aggregate: "sum", field: "confirmed_value_inr" }) as { value: number };
    expect(r.value).toBe(2_240_000);
    const g = queryRecords(s, { table: "opportunities", filters: [{ field: "stage", op: "eq", value: "partner_confirmed" }], group_by: ["industry"], aggregate: "count" }) as { groups: { value: number }[] };
    expect(g.groups.reduce((a, x) => a + x.value, 0)).toBe(24);
  });
  it("opted-out contacts are contact-level", () => {
    const r = queryRecords(s, { table: "contacts", filters: [{ field: "opted_out", op: "eq", value: true }], aggregate: "count" }) as { value: number };
    expect(r.value).toBe(7);
  });
  it("unknown field returns a helpful error instead of wrong data", () => {
    const r = queryRecords(s, { table: "brands", filters: [{ field: "revenue", op: "gt", value: 1 }] }) as { error?: string };
    expect(r.error).toMatch(/Unknown field/);
  });
});

describe("runTool", () => {
  it("get_kpis honours as_of", () => {
    const r = runTool(db, "get_kpis", { as_of: "2025-03-15" }, "2025-04-20").result as { confirmed_partnerships: number };
    expect(r.confirmed_partnerships).toBe(17);
  });
  it("ambiguous brand names return candidates", () => {
    const r = runTool(db, "get_brand", { name_or_id: "Aster" }, "2025-04-20").result as { ambiguous?: boolean };
    expect(r.ambiguous).toBe(true);
  });
  it("propose_task never writes and validates ids", () => {
    const before = db.tasks.length;
    const r = runTool(db, "propose_task", { title: "x", owner_id: "T99", rationale: "y" }, "2025-04-20");
    expect(r.proposal?.warnings[0]).toMatch(/Unknown owner/);
    expect(db.tasks.length).toBe(before);
  });
});
