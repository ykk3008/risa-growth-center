import { it, expect } from "vitest";
import seed from "../data/seed.json";
import type { DB } from "../lib/types";
import { forecastBacktest } from "../lib/metrics";

it("forecast backtest: projections made mid-campaign land close to the actual outcome", () => {
  const b = forecastBacktest(seed as unknown as DB, ["2025-02-15", "2025-03-01", "2025-03-15", "2025-04-01"]);
  console.log("BACKTEST", JSON.stringify(b));
  expect(b.actual_confirmed_at_event_eve).toBe(24);
  // From mid-campaign the open-pipeline forecast lands within 3 partnerships of the outcome.
  for (const p of b.points.slice(2)) expect(Math.abs(p.error!)).toBeLessThan(3);
  // Known limitation: early dates under-forecast because deals not yet created are invisible to a pipeline forecast.
  expect(b.points[0].error!).toBeLessThan(0);
});
