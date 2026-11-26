import { ok, fail } from "@/lib/api";
import { changeOpportunityStage } from "@/lib/actions";


const num = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : Number(v));

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const b = await req.json();
    return ok(await changeOpportunityStage({
      opportunity_id: id, stage: b.stage, effective_date: b.effective_date,
      proposed_value_inr: num(b.proposed_value_inr), confirmed_value_inr: num(b.confirmed_value_inr), note: b.note,
    }));
  } catch (e) { return fail(e); }
}
