import { ok, fail } from "@/lib/api";
import { updateTask, deleteTask } from "@/lib/actions";


export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { const { id } = await ctx.params; return ok(await updateTask(id, await req.json())); } catch (e) { return fail(e); }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { const { id } = await ctx.params; return ok(await deleteTask(id)); } catch (e) { return fail(e); }
}
