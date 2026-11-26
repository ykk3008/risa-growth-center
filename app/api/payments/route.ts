import { getStore } from "@/lib/store";
import { ok, fail, asOfFrom } from "@/lib/api";
import { snapshot, ts } from "@/lib/metrics";


export async function GET(req: Request) {
  try {
    const db = await getStore().load();
    const s = snapshot(db, asOfFrom(req));
    const brand = new Map(db.brands.map((b) => [b.brand_id, b.brand_name]));
    return ok({
      as_of: s.asOf,
      payments: db.payments.filter((p) => ts(p.invoiced_at) <= s.cutoff).map((p) => ({
        ...p, brand_name: brand.get(p.brand_id), received_as_of: !!p.received_at && ts(p.received_at) <= s.cutoff,
        overdue: !(p.received_at && ts(p.received_at) <= s.cutoff) && ts(p.due_at) < s.cutoff,
      })),
    });
  } catch (e) { return fail(e); }
}
