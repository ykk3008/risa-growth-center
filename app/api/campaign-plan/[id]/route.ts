import { ok, fail } from "@/lib/api";
import { updateCampaignPlan } from "@/lib/actions";


export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const b = await req.json();
    return ok(await updateCampaignPlan(id, {
      budget_inr: b.budget_inr === undefined ? undefined : Number(b.budget_inr),
      planned_hours: b.planned_hours === undefined ? undefined : Number(b.planned_hours),
      notes: b.notes,
    }));
  } catch (e) { return fail(e); }
}
