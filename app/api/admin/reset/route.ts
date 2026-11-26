import { ok, fail } from "@/lib/api";
import { resetData } from "@/lib/actions";


export async function POST(req: Request) {
  try { const b = await req.json().catch(() => ({})); return ok(await resetData("user", b.confirm)); } catch (e) { return fail(e); }
}
