import { getStore } from "@/lib/store";
import { ok, fail, asOfFrom } from "@/lib/api";
import { snapshot, brandDetail } from "@/lib/metrics";
import { changeQualification } from "@/lib/actions";


export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = await getStore().load();
    const d = brandDetail(snapshot(db, asOfFrom(req)), id);
    return d ? ok(d) : Response.json({ error: "not found" }, { status: 404 });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const b = await req.json();
    return ok(await changeQualification({ brand_id: id, status: b.status, reason: b.reason, effective_date: b.effective_date }));
  } catch (e) { return fail(e); }
}
