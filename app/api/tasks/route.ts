import { getStore } from "@/lib/store";
import { ok, fail, asOfFrom } from "@/lib/api";
import { snapshot, taskView } from "@/lib/metrics";
import { createTask } from "@/lib/actions";


export async function GET(req: Request) {
  try {
    const db = await getStore().load();
    const s = snapshot(db, asOfFrom(req));
    return ok({
      tasks: taskView(s),
      owners: [...s.owners.entries()].map(([id, name]) => ({ id, name })),
      campaigns: db.campaigns.map((c) => ({ id: c.sponsor_campaign_id, name: c.campaign_name })),
    });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    return ok(await createTask(b, b.source === "copilot" ? "copilot" : "user"));
  } catch (e) { return fail(e); }
}
