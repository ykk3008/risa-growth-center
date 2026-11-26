import { ok, fail } from "@/lib/api";
import { markPaymentReceived } from "@/lib/actions";


export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { const { id } = await ctx.params; const b = await req.json(); return ok(await markPaymentReceived(id, b.received_date)); } catch (e) { return fail(e); }
}
