import { getStore } from "@/lib/store";
import { connection } from "next/server";
import { ok, fail } from "@/lib/api";


export async function GET() {
  await connection();
  try { const db = await getStore().load(); return ok({ audit: [...db.audit_log].reverse().slice(0, 200) }); } catch (e) { return fail(e); }
}
