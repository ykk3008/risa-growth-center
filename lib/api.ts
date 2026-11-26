import "server-only";
import { ActionError } from "./actions";

export function ok(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}

export function fail(e: unknown) {
  // Let Next.js control-flow signals (e.g. prerender bail-out) propagate.
  const digest = (e as { digest?: unknown })?.digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
  const msg = e instanceof Error ? e.message : String(e);
  const status = e instanceof ActionError ? 400 : 500;
  if (status === 500) console.error(e);
  return Response.json({ ok: false, error: msg }, { status, headers: { "cache-control": "no-store" } });
}

export function asOfFrom(req: Request): string | undefined {
  const v = new URL(req.url).searchParams.get("asOf");
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}
