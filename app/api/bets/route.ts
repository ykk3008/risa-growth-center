import { getStore } from "@/lib/store";
import { ok, fail, asOfFrom } from "@/lib/api";
import { snapshot } from "@/lib/metrics";
import { betSignals } from "@/lib/bets";

export async function GET(req: Request) {
  try {
    const db = await getStore().load();
    return ok(betSignals(snapshot(db, asOfFrom(req))));
  } catch (e) { return fail(e); }
}
