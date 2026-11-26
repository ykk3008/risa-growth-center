import { ok, fail } from "@/lib/api";
import { setTargets } from "@/lib/actions";


export async function POST(req: Request) {
  try {
    const b = await req.json();
    return ok(await setTargets({
      qualified_brands_goal: Number(b.qualified_brands_goal), confirmed_partnerships_goal: Number(b.confirmed_partnerships_goal),
      effective_date: b.effective_date, label: b.label,
    }));
  } catch (e) { return fail(e); }
}
