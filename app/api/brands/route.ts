import { getStore } from "@/lib/store";
import { ok, fail, asOfFrom } from "@/lib/api";
import { snapshot } from "@/lib/metrics";


export async function GET(req: Request) {
  try {
    const db = await getStore().load();
    const s = snapshot(db, asOfFrom(req));
    const optOuts = new Set(s.interactions.filter((r) => r.event_type === "opt_out").map((r) => r.brand_id));
    const touched = new Map<string, number>();
    for (const r of s.interactions) touched.set(r.brand_id, (touched.get(r.brand_id) ?? 0) + 1);
    const opps = new Map<string, string[]>();
    for (const h of s.oppLatest.values()) opps.set(h.brand_id, [...(opps.get(h.brand_id) ?? []), h.stage]);
    const brands = db.brands.filter((b) => s.brandsVisible.has(b.brand_id)).map((b) => ({
      ...b,
      qualification: s.qualLatest.get(b.brand_id)?.qualification_status ?? "not yet assessed",
      source_campaign: s.qualLatest.get(b.brand_id)?.source_campaign_name ?? null,
      interactions: touched.get(b.brand_id) ?? 0,
      has_opt_out_contact: optOuts.has(b.brand_id),
      opportunity_stages: opps.get(b.brand_id) ?? [],
    }));
    return ok({ as_of: s.asOf, brands });
  } catch (e) { return fail(e); }
}
