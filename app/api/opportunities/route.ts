import { getStore } from "@/lib/store";
import { ok, fail, asOfFrom } from "@/lib/api";
import { snapshot, opportunityList, forecast } from "@/lib/metrics";


export async function GET(req: Request) {
  try {
    const db = await getStore().load();
    const s = snapshot(db, asOfFrom(req));
    const f = forecast(s);
    const w = new Map(f.open.map((o) => [o.opportunity_id, o.weight]));
    return ok({
      as_of: s.asOf,
      opportunities: opportunityList(s).map((o) => ({ ...o, forecast_weight: w.get(o.opportunity_id) ?? null })),
      forecast: { projected_confirmed: f.projected_confirmed, projected_value_inr: f.projected_value_inr, method: f.method },
    });
  } catch (e) { return fail(e); }
}
